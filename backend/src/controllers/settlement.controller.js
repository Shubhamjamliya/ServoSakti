const mongoose = require('mongoose');
const Payout = require('../models/Payout');
const Dispute = require('../models/Dispute');
const Incentive = require('../models/Incentive');
const Engineer = require('../models/Engineer');
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

/** Admin actions on a payout: approve, hold, release (back to pending), mark paid. */
exports.actOnPayout = asyncHandler(async (req, res) => {
  const { action, txnRef, note } = req.body;
  const p = await Payout.findById(req.params.id);
  if (!p) throw new ApiError(404, 'Payout not found');
  const entry = (status) => p.history.push({ status, at: new Date(), by: req.user.id, note });
  if (action === 'approve') {
    if (p.rateMissing) throw new ApiError(400, 'No rate card matched this call — add a rate card first');
    p.approval = 'approved'; p.holdReason = undefined; entry('approved');
  } else if (action === 'hold') {
    p.approval = 'held'; p.holdReason = note || 'Held by admin'; entry('held');
  } else if (action === 'release') {
    p.approval = 'pending'; p.holdReason = undefined; entry('released');
  } else if (action === 'pay') {
    if (p.approval !== 'approved') throw new ApiError(409, 'Approve the payout before paying');
    if (!txnRef) throw new ApiError(400, 'Transaction reference is required');
    p.paymentStatus = 'paid'; p.txnRef = txnRef; entry('paid');
  } else throw new ApiError(400, 'Unknown action');
  await p.save();
  audit(req.user, `payout.${action}`, 'Payout', p._id, { txnRef, note });
  const eng = p.engineerId ? await Engineer.findById(p.engineerId).lean() : null;
  if (['approve', 'pay'].includes(action) && eng) notify([eng._id], action === 'pay' ? 'Payment released' : 'Payout approved', `${p.srNumber}`, 'payment');
  res.json(p);
});

/** Re-fetches the rate card for a payout that was created without one (rateMissing). */
exports.summary = asyncHandler(async (req, res) => {
  const match = payoutScope(req);
  const [byOem, byVendor, totals] = await Promise.all([
    Payout.aggregate([{ $match: match }, { $group: { _id: '$oemId', calls: { $sum: 1 }, vendorAmount: { $sum: '$vendorAmount' }, engineerAmount: { $sum: '$engineerAmount' }, platformFee: { $sum: '$platformFee' }, tax: { $sum: '$tax' }, paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$vendorAmount', 0] } } } }, { $lookup: { from: 'oems', localField: '_id', foreignField: '_id', as: 'co' } }]),
    Payout.aggregate([{ $match: match }, { $group: { _id: '$vendorId', calls: { $sum: 1 }, vendorAmount: { $sum: '$vendorAmount' }, engineerAmount: { $sum: '$engineerAmount' }, platformFee: { $sum: '$platformFee' } } }, { $lookup: { from: 'vendors', localField: '_id', foreignField: '_id', as: 'co' } }]),
    Payout.aggregate([{ $match: match }, { $group: { _id: null, calls: { $sum: 1 }, vendorAmount: { $sum: '$vendorAmount' }, engineerAmount: { $sum: '$engineerAmount' }, platformFee: { $sum: '$platformFee' }, tax: { $sum: '$tax' }, pending: { $sum: { $cond: [{ $and: [{ $eq: ['$paymentStatus', 'unpaid'] }, { $eq: ['$approval', 'approved'] }] }, '$vendorAmount', 0] } } } }]),
  ]);
  const name = (r) => ({ ...r, id: r._id, name: r.co?.[0]?.legalName || '—', co: undefined });
  res.json({ totals: totals[0] || { calls: 0, vendorAmount: 0, engineerAmount: 0, platformFee: 0, tax: 0, pending: 0 }, byOem: byOem.map(name), byVendor: byVendor.map(name) });
});

/* ---- disputes ---- */
exports.listDisputes = asyncHandler(async (req, res) => {
  let filter = {};
  if (req.user.role === 'vendor_owner') filter = { vendorId: req.user.companyId };
  else if (req.user.role === 'engineer') filter = { engineerId: req.engineer._id };
  else if (req.user.role !== 'admin') filter = { _id: null };
  res.json(await paginate(Dispute, filter, req, { search: ['srNumber', 'reason', 'raisedByName'], filters: ['status'] }));
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

exports.resolveDispute = asyncHandler(async (req, res) => {
  const { decision, outcome } = req.body;
  if (!['approved', 'rejected'].includes(decision)) throw new ApiError(400, 'decision must be approved or rejected');
  const d = await Dispute.findByIdAndUpdate(req.params.id, { status: decision, outcome, resolvedBy: req.user.id }, { new: true });
  if (!d) throw new ApiError(404, 'Dispute not found');
  if (decision === 'approved') await Payout.updateOne({ _id: d.payoutId, approval: 'held' }, { approval: 'pending', holdReason: undefined });
  audit(req.user, `dispute.${decision}`, 'Dispute', d._id, { outcome });
  if (d.raisedBy) notify([d.raisedBy], `Dispute ${decision}`, `${d.srNumber}: ${outcome || ''}`, 'dispute');
  res.json(d);
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
