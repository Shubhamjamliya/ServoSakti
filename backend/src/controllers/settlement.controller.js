const mongoose = require('mongoose');
const Payout = require('../models/Payout');
const Dispute = require('../models/Dispute');
const Incentive = require('../models/Incentive');
const Engineer = require('../models/Engineer');
const ServiceRequest = require('../models/ServiceRequest');
const ProductPassport = require('../models/ProductPassport');
const Subtype = require('../models/Subtype');
const payments = require('../services/payment.service');
const wallets = require('../services/wallet.service');
const { ApiError, asyncHandler, paginate, istMonth } = require('../utils/helpers');
const { notify, notifyAdmins, audit } = require('../services/realtime');

// ObjectIds (not strings) so the same scope also works inside aggregate $match, which does no casting.
const payoutScope = (req) => {
  const { role } = req.user;
  const companyId = req.user.companyId && new mongoose.Types.ObjectId(req.user.companyId);
  if (role === 'admin') return {};
  if (role === 'oem') return { oemId: companyId };
  if (role === 'vendor_owner') return { vendorId: companyId };
  if (role === 'engineer') return { engineerId: req.engineer?._id || null };
  return { _id: null };
};

const POP = [{ path: 'engineerId', select: 'name engineerType' }, { path: 'vendorId', select: 'legalName' }, { path: 'oemId', select: 'legalName' }];
const shape = (p) => ({
  ...p, engineerName: p.engineerId?.name, vendorName: p.vendorId?.legalName, oemName: p.oemId?.legalName,
  engineerId: p.engineerId?._id || p.engineerId, vendorId: p.vendorId?._id || p.vendorId, oemId: p.oemId?._id || p.oemId,
});

exports.payouts = asyncHandler(async (req, res) => {
  const data = await paginate(Payout, payoutScope(req), req, { search: ['srNumber', 'brand'], filters: ['approval', 'paymentStatus', 'brand', 'vendorId', 'oemId'], populate: POP });
  data.items = data.items.map(shape);
  // Engineers see their own earnings only; hide the platform/vendor split from them.
  if (req.user.role === 'engineer') data.items = data.items.map(({ vendorAmount, platformFee, tax, rateSnapshot, ...rest }) => rest);
  res.json(data);
});

/** CSV of every payout the caller may see (company-wise scope applies), for accounts / invoicing. */
exports.exportPayouts = asyncHandler(async (req, res) => {
  const rows = await Payout.find(payoutScope(req)).populate(POP).sort({ createdAt: -1 }).lean();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['SR', 'OEM', 'Service company', 'Engineer', 'Brand', 'Job type', 'Warranty', 'Distance km', 'Vendor amount', 'Engineer amount', 'Platform fee', 'Tax', 'Approval', 'Payment', 'Txn ref', 'Created'];
  const hideSplit = req.user.role === 'engineer';
  const lines = rows.map((r) => [
    r.srNumber, r.oemId?.legalName, r.vendorId?.legalName, r.engineerId?.name, r.brand, r.jobType, r.warranty, r.distanceKm,
    hideSplit ? '' : r.vendorAmount, r.engineerAmount, hideSplit ? '' : r.platformFee, hideSplit ? '' : r.tax, r.approval, r.paymentStatus, r.txnRef, r.createdAt?.toISOString(),
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="payouts.csv"');
  res.send([head, ...lines].map((l) => l.map(esc).join(',')).join('\n'));
});

/**
 * Approving a payout credits the engineer's and the service company's wallets in the same transaction (they withdraw
 * from there). Approve can be clicked twice safely: the payout only moves once and the ledger keys are unique.
 */
async function approvePayout(id, user, note) {
  return wallets.inTransaction(async (session) => {
    const p = await Payout.findOneAndUpdate(
      { _id: id, approval: { $ne: 'approved' }, rateMissing: { $ne: true } },
      { approval: 'approved', paymentStatus: 'credited', $unset: { holdReason: 1 }, $push: { history: { status: 'approved', at: new Date(), by: user.id, note: note || 'Approved, credited to wallet' } } },
      { new: true, session },
    );
    if (!p) {
      const cur = await Payout.findById(id).session(session).lean();
      if (!cur) throw new ApiError(404, 'Payout not found');
      if (cur.rateMissing) throw new ApiError(400, 'No rate card matched this call — add a rate card first');
      return cur; // already approved
    }
    const common = { direction: 'credit', kind: 'job_earning', refType: 'Payout', refId: p._id, srNumber: p.srNumber, by: user.id, byRole: user.role };
    const entries = [];
    if (p.engineerId && p.engineerAmount > 0) entries.push({ ...common, ownerType: 'engineer', ownerId: p.engineerId, amount: p.engineerAmount, key: `payout:${p._id}:engineer`, note: `Earning for ${p.srNumber}` });
    if (p.vendorId && p.vendorAmount > 0) entries.push({ ...common, ownerType: 'vendor', ownerId: p.vendorId, amount: p.vendorAmount, key: `payout:${p._id}:vendor`, note: `Service company share for ${p.srNumber}` });
    await wallets.post(entries, { session });
    return p;
  });
}

/** Admin actions on a payout: approve (credits wallets), hold, release (back to pending). */
exports.actOnPayout = asyncHandler(async (req, res) => {
  const { action, note } = req.body;
  if (action === 'approve') {
    const p = await approvePayout(req.params.id, req.user, note);
    audit(req.user, 'payout.approve', 'Payout', p._id, { note });
    if (p.engineerId && p.engineerAmount > 0) notify([p.engineerId], 'Earning credited', `₹${p.engineerAmount} for ${p.srNumber} added to your wallet`, 'payment');
    if (p.vendorId && p.vendorAmount > 0) notify([p.vendorId], 'Earning credited', `₹${p.vendorAmount} for ${p.srNumber} added to your wallet`, 'payment');
    return res.json(p);
  }
  const p = await Payout.findById(req.params.id);
  if (!p) throw new ApiError(404, 'Payout not found');
  if (p.approval === 'approved') throw new ApiError(409, 'This payout is already credited to the wallets. Use a wallet adjustment to correct it.');
  const entry = (status) => p.history.push({ status, at: new Date(), by: req.user.id, note });
  if (action === 'hold') {
    p.approval = 'held'; p.holdReason = note || 'Held by admin'; entry('held');
  } else if (action === 'release') {
    p.approval = 'pending'; p.holdReason = undefined; entry('released');
  } else throw new ApiError(400, 'Unknown action');
  await p.save();
  audit(req.user, `payout.${action}`, 'Payout', p._id, { note });
  res.json(p);
});

/** Approves every pending payout in the current filter (e.g. all of last week). */
exports.approveAll = asyncHandler(async (req, res) => {
  const ids = (await Payout.find({ approval: 'pending', rateMissing: { $ne: true }, ...(req.body.ids?.length ? { _id: { $in: req.body.ids } } : {}) }).select('_id').lean()).map((p) => p._id);
  let done = 0;
  for (const id of ids) { await approvePayout(id, req.user, 'Bulk approval'); done += 1; }
  audit(req.user, 'payout.approve-all', 'Payout', null, { count: done });
  res.json({ approved: done });
});

/** Re-fetches the rate card for a payout that was created without one (rateMissing). */
exports.summary = asyncHandler(async (req, res) => {
  const match = payoutScope(req);
  const [byOem, byVendor, totals] = await Promise.all([
    Payout.aggregate([{ $match: match }, { $group: { _id: '$oemId', calls: { $sum: 1 }, vendorAmount: { $sum: '$vendorAmount' }, engineerAmount: { $sum: '$engineerAmount' }, platformFee: { $sum: '$platformFee' }, tax: { $sum: '$tax' }, paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$vendorAmount', 0] } } } }, { $lookup: { from: 'oems', localField: '_id', foreignField: '_id', as: 'co' } }]),
    Payout.aggregate([{ $match: match }, { $group: { _id: '$vendorId', calls: { $sum: 1 }, vendorAmount: { $sum: '$vendorAmount' }, engineerAmount: { $sum: '$engineerAmount' }, platformFee: { $sum: '$platformFee' } } }, { $lookup: { from: 'vendors', localField: '_id', foreignField: '_id', as: 'co' } }]),
    Payout.aggregate([{ $match: match }, { $group: { _id: null, calls: { $sum: 1 }, vendorAmount: { $sum: '$vendorAmount' }, engineerAmount: { $sum: '$engineerAmount' }, platformFee: { $sum: '$platformFee' }, tax: { $sum: '$tax' }, pending: { $sum: { $cond: [{ $ne: ['$approval', 'approved'] }, '$vendorAmount', 0] } }, credited: { $sum: { $cond: [{ $in: ['$paymentStatus', ['credited', 'paid']] }, '$vendorAmount', 0] } } } }]),
  ]);
  const name = (r) => ({ ...r, id: r._id, name: r.co?.[0]?.legalName || '—', co: undefined });
  res.json({ totals: totals[0] || { calls: 0, vendorAmount: 0, engineerAmount: 0, platformFee: 0, tax: 0, pending: 0, credited: 0 }, byOem: byOem.map(name), byVendor: byVendor.map(name) });
});

/* ---- disputes ---- */
exports.listDisputes = asyncHandler(async (req, res) => {
  let filter = {};
  if (req.user.role === 'vendor_owner') filter = { vendorId: req.user.companyId };
  else if (req.user.role === 'engineer') filter = { engineerId: req.engineer._id };
  else if (req.user.role === 'customer') filter = { customerId: req.customer._id };
  else if (req.user.role !== 'admin') filter = { _id: null };
  res.json(await paginate(Dispute, filter, req, { search: ['srNumber', 'reason', 'raisedByName'], filters: ['status', 'kind'] }));
});

/** The vendor gives its side of a customer dispute. */
exports.respondDispute = asyncHandler(async (req, res) => {
  const d = await Dispute.findOneAndUpdate({ _id: req.params.id, vendorId: req.user.companyId, status: 'open' }, { vendorResponse: String(req.body.response || '').trim() }, { new: true });
  if (!d) throw new ApiError(404, 'Dispute not found');
  notifyAdmins('Vendor responded to dispute', `${d.srNumber}: ${d.vendorResponse}`, 'dispute');
  res.json(d);
});

exports.createDispute = asyncHandler(async (req, res) => {
  const p = await Payout.findOne({ _id: req.body.payoutId, ...payoutScope(req) });
  if (!p) throw new ApiError(404, 'Payout not found');
  if (!req.body.reason) throw new ApiError(400, 'Reason is required');
  const d = await Dispute.create({ payoutId: p._id, srNumber: p.srNumber, raisedBy: req.user.id, raisedByName: req.user.name, vendorId: p.vendorId, engineerId: p.engineerId, reason: req.body.reason });
  notifyAdmins('Payment dispute raised', `${p.srNumber}: ${req.body.reason}`, 'dispute');
  audit(req.user, 'dispute.create', 'Dispute', d._id);
  res.status(201).json(d);
});

/**
 * Admin decides. For a customer dispute the admin can refund part or all of what was paid and correct the product type,
 * so the next booking shows the right price. The job's payout hold is lifted either way.
 */
exports.resolveDispute = asyncHandler(async (req, res) => {
  const { decision, outcome } = req.body;
  if (!['approved', 'rejected'].includes(decision)) throw new ApiError(400, 'decision must be approved or rejected');
  const d = await Dispute.findById(req.params.id);
  if (!d) throw new ApiError(404, 'Dispute not found');
  if (d.status !== 'open') throw new ApiError(409, 'This dispute is already resolved');
  Object.assign(d, { status: decision, outcome, resolvedBy: req.user.id });

  if (d.kind === 'service') {
    const sr = await ServiceRequest.findById(d.serviceRequestId);
    if (decision === 'approved' && sr) {
      const refund = Math.round((Number(req.body.refundAmount) || 0) * 100) / 100;
      if (refund > 0) {
        await payments.syncBill(sr);
        const net = Math.round(((sr.bill?.paid || 0) - (sr.bill?.refunded || 0) - (sr.bill?.excess || 0)) * 100) / 100;
        if (refund > net) throw new ApiError(400, `At most ₹${net} can be refunded on this job`);
        // a credit note on the bill lowers what this job cost, so paid − total becomes the refund owed
        sr.bill.lines = [...(sr.bill.lines || []), { code: `credit_${d._id}`, kind: 'credit', label: 'Credit note (dispute)', qty: 1, unitPrice: -refund, listAmount: -refund, amount: -refund, covered: false }];
        sr.bill.creditNote = Math.round(((sr.bill.creditNote || 0) + refund) * 100) / 100;
        sr.bill.total = Math.round((sr.bill.total - refund) * 100) / 100;
        sr.markModified('bill');
        // the admin already decided: it completes as soon as the customer picks wallet or original payment
        await payments.settleExcess(sr, `Dispute ${d.srNumber}`, { preApproved: true });
        await sr.save();
        d.refundAmount = refund;
      }
      if (req.body.correctedSubtypeId && sr.passportId) {
        const subtype = await Subtype.findById(req.body.correctedSubtypeId).lean();
        if (!subtype) throw new ApiError(400, 'Unknown product type');
        await ProductPassport.updateOne({ _id: sr.passportId }, { subtypeId: subtype._id, subtypeName: subtype.name, category: subtype.category });
        d.correctedSubtypeId = subtype._id;
      }
    }
    await Payout.updateOne({ serviceRequestId: d.serviceRequestId, approval: 'held', holdReason: 'Customer dispute open' }, { approval: 'pending', holdReason: undefined });
  } else if (decision === 'approved') {
    await Payout.updateOne({ _id: d.payoutId, approval: 'held' }, { approval: 'pending', holdReason: undefined });
  }
  await d.save();
  audit(req.user, `dispute.${decision}`, 'Dispute', d._id, { outcome, refund: d.refundAmount });
  if (d.raisedBy) notify([d.raisedBy], `Dispute ${decision}`, `${d.srNumber}: ${outcome || ''}${d.refundAmount ? ` · ₹${d.refundAmount} refunded` : ''}`, 'dispute');
  res.json(d);
});

/* ---- monthly warranty claim to the OEM: every approved warranty job with its labour cost and covered parts ---- */
const claimScope = (req) => (req.user.role === 'oem' ? { oemId: new mongoose.Types.ObjectId(req.user.companyId) } : {});

exports.warrantyClaims = asyncHandler(async (req, res) => {
  const filter = { ...claimScope(req), coverage: 'warranty', 'oemClaim.status': { $in: ['pending', 'approved', 'rejected', 'paid'] } };
  if (req.query.month) {
    const from = new Date(`${req.query.month}-01T00:00:00+05:30`);
    const to = new Date(from); to.setMonth(to.getMonth() + 1);
    filter.approvedAt = { $gte: from, $lt: to };
  }
  if (req.query.status && req.query.status !== 'all') filter['oemClaim.status'] = req.query.status;
  const data = await paginate(ServiceRequest, filter, req, { search: ['srNumber', 'serialNumber', 'brand'], sort: { approvedAt: -1 }, populate: [{ path: 'oemId', select: 'legalName' }] });
  data.items = data.items.map((s) => ({
    _id: s._id, srNumber: s.srNumber, oemName: s.oemId?.legalName, oemId: s.oemId?._id || s.oemId, brand: s.brand, model: s.model, serialNumber: s.serialNumber, subtypeName: s.subtypeName, jobType: s.jobType,
    approvedAt: s.approvedAt, nameplatePhoto: s.verification?.nameplatePhoto, parts: (s.parts || []).map((p) => `${p.name} × ${p.qty}`).join(', '), claim: s.oemClaim,
  }));
  const totals = await ServiceRequest.aggregate([{ $match: filter }, { $group: { _id: '$oemClaim.status', amount: { $sum: '$oemClaim.amount' }, jobs: { $sum: 1 } } }]);
  res.json({ ...data, totals });
});

/**
 * Admin records that an OEM paid its approved claims for a month: every approved line of that OEM and month becomes
 * paid with the reference. Lines still pending stay pending (they go into a later payment).
 */
exports.settleClaims = asyncHandler(async (req, res) => {
  const { oemId, month, reference } = req.body;
  if (!oemId || !/^\d{4}-\d{2}$/.test(String(month || ''))) throw new ApiError(400, 'Choose the OEM and month');
  if (!String(reference || '').trim()) throw new ApiError(400, 'Enter the payment reference (UTR)');
  const from = new Date(`${month}-01T00:00:00+05:30`);
  const to = new Date(from); to.setMonth(to.getMonth() + 1);
  const filter = { oemId, coverage: 'warranty', 'oemClaim.status': 'approved', approvedAt: { $gte: from, $lt: to } };
  const lines = await ServiceRequest.find(filter).select('oemClaim.amount').lean();
  if (!lines.length) throw new ApiError(409, 'No approved claims for this OEM and month');
  const amount = Math.round(lines.reduce((a, l) => a + (l.oemClaim?.amount || 0), 0) * 100) / 100;
  await ServiceRequest.updateMany(filter, { 'oemClaim.status': 'paid', 'oemClaim.paidAt': new Date(), 'oemClaim.paidRef': String(reference).trim() });
  audit(req.user, 'claim.settle', 'Oem', oemId, { month, reference, amount, lines: lines.length });
  notify([oemId], 'Warranty claims settled', `${month}: ${lines.length} claims, Rs. ${amount} recorded as paid (${reference})`, 'claim');
  res.json({ lines: lines.length, amount });
});

exports.decideClaim = asyncHandler(async (req, res) => {
  const { decision, note } = req.body;
  if (!['approved', 'rejected'].includes(decision)) throw new ApiError(400, 'decision must be approved or rejected');
  const sr = await ServiceRequest.findOne({ _id: req.params.srId, ...claimScope(req), 'oemClaim.status': 'pending' });
  if (!sr) throw new ApiError(404, 'Claim not found');
  sr.oemClaim = { ...sr.oemClaim.toObject(), status: decision, decidedAt: new Date(), note };
  await sr.save();
  audit(req.user, `claim.${decision}`, 'ServiceRequest', sr._id, { note });
  // a rejected line is reviewed by the admin; it is never charged back to the customer after the job is closed
  if (decision === 'rejected') notifyAdmins('Warranty claim rejected', `${sr.srNumber}: ${note || 'no reason given'}`, 'claim');
  res.json(sr.oemClaim);
});

/* ---- incentives (5 approved calls/month -> free 28-day recharge) ---- */
exports.incentives = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'engineer' ? { engineerId: req.engineer._id } : req.user.role === 'admin' ? {} : { _id: null };
  const data = await paginate(Incentive, filter, req, { search: ['engineerName'], filters: ['month'], sort: { month: -1, approvedCalls: -1 } });
  const { minApprovedCallsForRecharge } = await require('../models/Setting').get();
  data.items = data.items.map((i) => ({ ...i, target: minApprovedCallsForRecharge, status: i.rechargeIssuedAt ? 'Issued' : i.rechargeEligible ? 'Eligible' : 'In progress' }));
  if (req.query.status && req.query.status !== 'all') data.items = data.items.filter((i) => i.status === req.query.status);
  res.json({ ...data, month: istMonth() });
});

exports.issueRecharge = asyncHandler(async (req, res) => {
  const inc = await Incentive.findById(req.params.id);
  if (!inc) throw new ApiError(404, 'Incentive not found');
  if (!inc.rechargeEligible) throw new ApiError(409, 'Engineer has not reached the monthly threshold');
  inc.rechargeIssuedAt = new Date();
  inc.rechargeNote = req.body.note;
  await inc.save();
  const eng = await Engineer.findById(inc.engineerId).lean();
  notify([eng?._id], 'Free recharge issued', `${inc.rechargeDays}-day mobile recharge for ${inc.month}`, 'incentive');
  audit(req.user, 'incentive.issue', 'Incentive', inc._id);
  res.json(inc);
});
