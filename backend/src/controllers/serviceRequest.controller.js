const ServiceRequest = require('../models/ServiceRequest');
const ProductPassport = require('../models/ProductPassport');
const Product = require('../models/Product');
const Oem = require('../models/Oem');
const Vendor = require('../models/Vendor');
const Authorization = require('../models/Authorization');
const FieldReport = require('../models/FieldReport');
const DispatchLog = require('../models/DispatchLog');
const Counter = require('../models/Counter');
const Setting = require('../models/Setting');
const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const Dispute = require('../models/Dispute');
const { ApiError, asyncHandler, paginate, ci } = require('../utils/helpers');
const dispatch = require('../services/dispatch.service');
const pricing = require('../services/pricing.service');
const payments = require('../services/payment.service');
const booking = require('../services/booking.service');
const wallets = require('../services/wallet.service');
const coupons = require('../services/coupon.service');
const invoices = require('../services/invoice.service');
const { warrantyClaimable } = pricing;
const { detectZone, hasActiveZones } = require('../services/zone.service');
const { notify, notifyAdmins, notifyCompany, audit } = require('../services/realtime');

/** Which service requests a user may see. Multi-company separation lives here. */
const scopeFor = (req) => {
  const { role, companyId } = req.user;
  if (role === 'admin') return {};
  if (role === 'oem') return { oemId: companyId };
  if (role === 'vendor_owner') return { $or: [{ vendorId: companyId }, { outsourcedBy: companyId }] }; // includes calls handed to a partner
  if (role === 'engineer') return { engineerId: req.engineer?._id || null };
  if (role === 'customer') return { customerId: req.customer?._id || null };
  return { _id: null };
};

const POPULATE = [{ path: 'vendorId', select: 'legalName' }, { path: 'engineerId', select: 'name phone' }, { path: 'oemId', select: 'legalName' }];
const shape = (sr) => ({
  ...sr, id: sr._id, vendorName: sr.vendorId?.legalName, outsourcedBy: sr.outsourcedBy, engineerName: sr.engineerId?.name, engineerPhone: sr.engineerId?.phone, oemName: sr.oemId?.legalName,
  vendorId: sr.vendorId?._id || sr.vendorId, engineerId: sr.engineerId?._id || sr.engineerId, oemId: sr.oemId?._id || sr.oemId,
});

/** The closure OTP code is shown only to the customer (to read out to the engineer) and only while it is still usable. */
const otpFor = (sr, req) => {
  if (!sr.otp) return sr.otp;
  const { code, ...rest } = sr.otp;
  const live = req.user.role === 'customer' && !rest.verified && rest.expiresAt && new Date(rest.expiresAt) > new Date();
  return live ? { ...rest, code } : rest;
};
const shapeFor = (req) => (sr) => ({ ...shape(sr), otp: otpFor(sr, req) });

async function pickVendor(sr) {
  const auths = await Authorization.find({ oemId: sr.oemId, status: 'active', backup: false }).lean();
  for (const a of auths) {
    const brandOk = !sr.brand || a.brands.some((b) => ci(sr.brand).test(b));
    const cityOk = !sr.city || a.cities.some((c) => ci(sr.city).test(c));
    if (brandOk && cityOk && (await Vendor.exists({ _id: a.vendorId, status: 'approved' }))) return a.vendorId;
  }
  return null;
}

async function verifyRequest(sr, user, patch = {}) {
  const settings = await Setting.get();
  ['warranty', 'priority', 'jobType'].forEach((k) => patch[k] && (sr[k] = patch[k]));
  sr.vendorId = patch.vendorId || sr.vendorId || (await pickVendor(sr)) || undefined;
  sr.status = 'verified';
  await sr.save();
  audit(user, 'sr.verify', 'ServiceRequest', sr._id, { vendorId: sr.vendorId });
  if (sr.customerId) await notify([sr.customerId], 'Request verified', `${sr.srNumber} is verified and being assigned`, 'service');
  if (sr.vendorId) await notifyCompany(sr.vendorId, 'New call', `${sr.srNumber} · ${sr.brand} ${sr.model || ''} (${sr.city || '—'}) is with your company`, 'new_call');
  if (settings.autoDispatch) await dispatch.startDispatch(sr, user.id);
  return sr;
}

/**
 * Builds the request document from the body: product, customer, address, zone and OEM. Shared by booking and the
 * price estimate so both apply exactly the same checks.
 */
async function prepare(req) {
  const b = req.body;
  const settings = await Setting.get();
  const doc = {
    brand: b.brand, model: b.model, serialNumber: b.serialNumber, jobType: b.jobType || 'breakdown', priority: b.priority || 'Medium',
    issue: b.issue, city: b.city, address: b.address, location: b.location, complaintId: b.complaintId, warranty: 'non_warranty',
    subtypeId: b.subtypeId || undefined,
  };

  let passport = null;
  if (b.passportId) {
    passport = await ProductPassport.findById(b.passportId).lean();
    if (!passport) throw new ApiError(404, 'Product passport not found');
    if (req.user.role === 'customer' && String(passport.customerId) !== String(req.customer._id) && passport.customerPhone !== req.customer.phone) throw new ApiError(403, 'Not your product');
    if (passport.blocked) throw new ApiError(403, 'This product is blocked. Please contact support.');
    Object.assign(doc, { passportId: passport._id, brand: passport.brand, model: passport.model, serialNumber: passport.serialNumber, subtypeId: passport.subtypeId || doc.subtypeId });
    if (passport.warrantyEnd && new Date(passport.warrantyEnd) >= new Date() && warrantyClaimable(passport)) doc.warranty = 'warranty';
  }
  if (!doc.brand) throw new ApiError(400, 'Brand is required (select a product passport or enter the brand)');
  if (b.warranty && ['oem', 'admin'].includes(req.user.role)) doc.warranty = b.warranty; // OEM/admin may override the computed value

  if (req.user.role === 'customer') {
    const saved = req.customer.addresses || [];
    const addr = (b.addressId && saved.find((x) => String(x._id) === String(b.addressId))) || saved.find((x) => x.isDefault) || saved[0];
    Object.assign(doc, { customerId: req.customer._id, customerName: req.customer.name, customerPhone: req.customer.phone });
    doc.city = doc.city || addr?.city;
    doc.address = doc.address || addr?.line;
    if (!doc.location?.lat && addr?.lat != null) doc.location = { lat: addr.lat, lng: addr.lng };
  } else {
    Object.assign(doc, { customerName: b.customerName || passport?.customerName, customerPhone: b.customerPhone || passport?.customerPhone, customerId: passport?.customerId });
  }

  // Match the job location to a service zone. Customers outside every zone are turned away (admin can relax this in Settings).
  if (doc.location?.lat != null) {
    const zone = await detectZone(doc.location.lat, doc.location.lng);
    if (zone) Object.assign(doc, { zoneId: zone._id, zoneName: zone.name, city: doc.city || zone.city });
    else if (settings.enforceZones && (await hasActiveZones())) throw new ApiError(422, 'This location is outside our service area');
  } else if (req.user.role === 'customer' && settings.enforceZones && (await hasActiveZones())) {
    throw new ApiError(400, 'Add a service address on the map first (Profile → Service addresses)');
  }

  if (req.user.role === 'oem') doc.oemId = req.user.companyId;
  else if (req.user.role === 'admin' && b.oemId) doc.oemId = b.oemId;
  else {
    const product = passport?.productId ? await Product.findById(passport.productId).lean() : null;
    const oem = product ? { _id: product.oemId } : await Oem.findOne({ status: 'approved', authorizedBrands: ci(doc.brand) }).lean();
    doc.oemId = oem?._id;
  }
  if (!doc.oemId) throw new ApiError(400, `No approved OEM found for brand "${doc.brand}"`);

  if (doc.serialNumber) {
    const since = new Date(Date.now() - (settings.pricing?.repeatVisitDays ?? 30) * 86400000);
    const prev = await ServiceRequest.findOne({ oemId: doc.oemId, serialNumber: doc.serialNumber, status: { $in: ['approved', 'closed'] }, approvedAt: { $gte: since } }).sort({ approvedAt: -1 }).lean();
    if (prev) doc.repeatOf = prev._id;
  }

  if (req.user.role === 'customer') {
    if (doc.passportId) {
      const open = await ServiceRequest.findOne({ passportId: doc.passportId, status: { $in: ['pending_payment', 'created', 'verified', 'offered', 'unassigned', 'assigned', 'in_progress', 'under_review'] } }).select('srNumber').lean();
      if (open) throw new ApiError(409, `${open.srNumber} is already open for this product. Track it from My Requests.`);
    }
    const unpaid = await ServiceRequest.findOne({ customerId: req.customer._id, 'bill.due': { $gt: 0 }, status: { $in: ['approved', 'closed', 'failed', 'cancelled'] } }).select('srNumber bill.due').lean();
    if (unpaid) throw new ApiError(402, `Please clear ₹${unpaid.bill.due} due on ${unpaid.srNumber} before a new booking`);
  }
  return { doc, passport, settings };
}

/** Prices a prepared request when its product type is known. Returns null for unpriced (legacy / brand-only) requests. */
async function priceFor(req, { doc, passport, settings }, { strictCoupon = false } = {}) {
  if (!doc.subtypeId) return null;
  const b = req.body;
  const isCustomer = req.user.role === 'customer';
  const firstBooking = isCustomer && !(await ServiceRequest.exists({ customerId: req.customer._id, status: { $in: ['approved', 'closed'] } }));
  return pricing.quoteBooking({
    passport, subtypeId: doc.subtypeId, brand: doc.brand, jobType: doc.jobType, slot: b.slot, scheduledAt: b.scheduledAt, addOnIds: b.addOnIds,
    location: doc.location, zoneId: doc.zoneId, paymentMode: b.paymentMode === 'prepaid' ? 'prepaid' : 'postpaid',
    repeat: !!doc.repeatOf && doc.jobType === 'breakdown', firstBooking, settings,
    couponCode: isCustomer ? b.couponCode : undefined, customerId: isCustomer ? req.customer._id : undefined, strictCoupon,
  });
}

/**
 * Takes what is due now: first from the customer's wallet (when asked), the rest through Razorpay.
 * Returns the Razorpay checkout for the remainder, or null when the wallet covered everything.
 */
async function collect(customer, { amount, purpose, sr, useWallet, description }) {
  let left = amount;
  if (useWallet) {
    const fromWallet = await payments.payFromWallet({ customer, purpose, amount, serviceRequestId: sr._id });
    if (fromWallet) left = Math.round((left - fromWallet.amount) * 100) / 100;
  }
  if (left <= 0) return null;
  return payments.createOrder({ customer, purpose, amount: left, serviceRequestId: sr._id, description });
}

/** Price shown before booking. Nothing is saved. */
exports.estimate = asyncHandler(async (req, res) => {
  const prepared = await prepare(req);
  const quote = await priceFor(req, prepared);
  if (!quote) throw new ApiError(400, 'Choose the product type (for example Split AC 1.5 Ton) to see the price');
  res.json({
    coverage: quote.coverage, subscription: quote.subscription && { _id: quote.subscription._id, type: quote.subscription.type, endDate: quote.subscription.endDate, pmVisitsUsed: quote.subscription.pmVisitsUsed, pmVisitsTotal: quote.subscription.pmVisitsTotal },
    subtypeName: quote.subtype.name, jobType: prepared.doc.jobType, slot: quote.slot, scheduledAt: quote.scheduledAt, distance: quote.distance, bill: quote.bill,
    repeat: !!prepared.doc.repeatOf, verified: !!prepared.passport?.verified, couponError: quote.couponError,
    walletBalance: req.user.role === 'customer' ? (await wallets.summary('customer', req.customer._id)).balance : undefined,
  });
});

exports.create = asyncHandler(async (req, res) => {
  const prepared = await prepare(req);
  const { doc, settings } = prepared;
  const quote = await priceFor(req, prepared, { strictCoupon: true });
  if (quote) {
    Object.assign(doc, {
      subtypeName: quote.subtype.name, coverage: quote.coverage, subscriptionId: quote.subscription?._id, slot: quote.slot, scheduledAt: quote.scheduledAt,
      addOnIds: quote.addOns.map((a) => a._id), paymentMode: req.body.paymentMode === 'prepaid' ? 'prepaid' : 'postpaid',
      bill: pricing.withPayments(quote.bill), priceSnapshot: quote.snapshot, warranty: quote.coverage === 'warranty' ? 'warranty' : 'non_warranty',
    });
    doc.paymentStatus = doc.bill.total > 0 ? 'pending' : 'not_required';
    if (quote.slot === 'urgent') doc.priority = 'Urgent';
  }
  const payNow = req.user.role === 'customer' && quote?.bill.upfront > 0;
  if (payNow) doc.status = 'pending_payment';

  doc.srNumber = `SR-${1000 + (await Counter.next('sr'))}`;
  doc.tatDueAt = new Date(Date.now() + (settings.slaHours?.[doc.priority] || 48) * 3600000);
  // the booking and its coupon use are saved together, or not at all
  const sr = await wallets.inTransaction(async (session) => {
    const [created] = await ServiceRequest.create([doc], { session });
    if (quote?.coupon) await coupons.redeem(quote.coupon, created, quote.bill.couponDiscount, session);
    return created;
  });
  audit(req.user, 'sr.create', 'ServiceRequest', sr._id, { by: req.user.role, total: sr.bill?.total, coupon: quote?.coupon?.code });

  if (payNow) {
    const payment = await collect(req.customer, { amount: quote.bill.upfront, purpose: 'booking', sr, useWallet: !!req.body.useWallet, description: `${sr.srNumber} booking` });
    const fresh = await ServiceRequest.findById(sr._id).lean();
    return res.status(201).json({ ...fresh, payment });
  }
  if (sr.customerId) await notify([sr.customerId], 'Service request raised', `${sr.srNumber} · ${sr.brand} ${sr.model || ''} — we will assign an engineer shortly`, 'service');
  if (['oem', 'admin'].includes(req.user.role)) await verifyRequest(sr, req.user);
  else {
    await notifyCompany(sr.oemId, 'New service request', `${sr.srNumber} · ${sr.brand} ${sr.model || ''} (${sr.city || '—'})`, 'service');
    await notifyAdmins('New service request', `${sr.srNumber} awaiting verification`, 'service');
  }
  res.status(201).json(sr);
});

const findMine = async (req) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.id, ...scopeFor(req) });
  if (!sr) throw new ApiError(404, 'Service request not found');
  return sr;
};

/** Customer pays what is due (prepaid top-up, final bill, visit charge, cancellation fee) through Razorpay. */
exports.pay = asyncHandler(async (req, res) => {
  const sr = await findMine(req);
  await payments.syncBill(sr);
  await sr.save();
  const useWallet = !!req.body.useWallet;
  if (sr.status === 'pending_payment') {
    // still to pay before the booking is confirmed = upfront minus what is already in
    const left = Math.round(((sr.bill.upfront || 0) - ((sr.bill.paid || 0) - (sr.bill.refunded || 0))) * 100) / 100;
    if (left <= 0) throw new ApiError(409, 'This booking is already paid');
    await Payment.updateMany({ serviceRequestId: sr._id, status: 'created' }, { status: 'expired' }); // old unpaid checkout
    const payment = await collect(req.customer, { amount: left, purpose: 'booking', sr, useWallet, description: `${sr.srNumber} booking` });
    return res.json({ payment, paidFromWallet: !payment });
  }
  if (!(sr.bill?.due > 0)) throw new ApiError(409, 'Nothing is due on this request');
  if (sr.quote?.status === 'pending') throw new ApiError(409, 'Approve or reject the revised price first');
  const payment = await collect(req.customer, { amount: sr.bill.due, purpose: 'bill', sr, useWallet, description: `${sr.srNumber} payment` });
  res.json({ payment, paidFromWallet: !payment });
});

/** Tax invoice PDF for a job (customer, admin, its OEM / service company). */
exports.invoice = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.id, ...scopeFor(req) }).lean();
  if (!sr) throw new ApiError(404, 'Service request not found');
  if (!sr.bill || !(sr.bill.total > 0 || sr.bill.paid > 0)) throw new ApiError(409, 'There is nothing billed on this request');
  if (sr.status === 'pending_payment') throw new ApiError(409, 'The invoice is available once the booking is paid');
  await invoices.serviceInvoice(sr, res);
});

exports.respondQuote = asyncHandler(async (req, res) => {
  const sr = await findMine(req);
  res.json(await booking.respondQuote(sr, req.body.decision, req.user));
});

exports.reschedule = asyncHandler(async (req, res) => {
  const sr = await findMine(req);
  res.json(await booking.reschedule(sr, req.body.scheduledAt, req.user));
});

/** Customer raises a dispute about a finished job (wrong charge, poor work…). The job's payout is held until resolved. */
exports.dispute = asyncHandler(async (req, res) => {
  const sr = await findMine(req);
  const { pricing: p } = await Setting.get();
  if (p.disputesEnabled === false) throw new ApiError(403, 'Reporting a problem is turned off. Please contact support.');
  if (!['approved', 'closed', 'failed'].includes(sr.status)) throw new ApiError(409, 'You can raise a dispute once the visit is finished');
  const finishedAt = sr.closedAt || sr.approvedAt || sr.completedAt || sr.updatedAt;
  if (Date.now() - new Date(finishedAt) > (p.disputeWindowDays ?? 7) * 86400000) throw new ApiError(409, `Disputes can be raised within ${p.disputeWindowDays ?? 7} days of the visit`);
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new ApiError(400, 'Describe the problem');
  if (await Dispute.exists({ serviceRequestId: sr._id, status: 'open' })) throw new ApiError(409, 'A dispute is already open for this request');
  const payout = await Payout.findOne({ serviceRequestId: sr._id }).sort({ createdAt: -1 });
  if (payout && payout.paymentStatus !== 'paid') {
    payout.approval = 'held';
    payout.holdReason = 'Customer dispute open';
    payout.history.push({ status: 'held', at: new Date(), note: 'Customer dispute' });
    await payout.save();
  }
  const d = await Dispute.create({
    kind: 'service', serviceRequestId: sr._id, payoutId: payout?._id, srNumber: sr.srNumber, customerId: sr.customerId, raisedBy: req.user.id, raisedByRole: 'customer', raisedByName: req.user.name,
    vendorId: sr.vendorId, engineerId: sr.engineerId, category: req.body.category, reason, photos: req.body.photos || [],
  });
  await notifyAdmins('Customer dispute', `${sr.srNumber}: ${reason}`, 'dispute');
  await notifyCompany(sr.vendorId, 'Customer dispute', `${sr.srNumber}: ${reason}. Respond within 24 hours.`, 'dispute');
  audit(req.user, 'dispute.create', 'Dispute', d._id);
  res.status(201).json(d);
});

exports.list = asyncHandler(async (req, res) => {
  const filter = scopeFor(req);
  // outsourced=1: calls handed to a partner (even before they accept) plus partner jobs received from others
  if (req.query.outsourced === '1') filter.$and = [{ $or: [{ outsourcedBy: { $ne: null } }, { origin: { $in: ['outsourced', 'partner'] } }] }];
  const data = await paginate(ServiceRequest, filter, req, {
    search: ['srNumber', 'customerName', 'brand', 'model', 'city', 'serialNumber'], filters: ['status', 'priority', 'city', 'jobType', 'origin', 'warranty', 'coverage', 'paymentStatus', 'quote.status'],
    populate: POPULATE,
  });
  data.items = data.items.map(shapeFor(req));
  res.json(data);
});

exports.get = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.id, ...scopeFor(req) }).populate(POPULATE).lean();
  if (!sr) throw new ApiError(404, 'Service request not found');
  const staff = !['engineer', 'customer'].includes(req.user.role);
  const [report, logs, paymentList] = await Promise.all([
    FieldReport.findOne({ serviceRequestId: sr._id }).lean(),
    staff ? DispatchLog.find({ serviceRequestId: sr._id }).sort({ createdAt: 1 }).lean() : [],
    // every rupee on this job (online, cash, refunds) for the admin / OEM / service company view
    staff ? Payment.find({ serviceRequestId: sr._id }).populate('collectedBy', 'name').sort({ createdAt: 1 }).lean() : [],
  ]);
  const out = shapeFor(req)(sr);
  res.json({ ...out, report, dispatchLogs: logs, payments: paymentList.map((p) => ({ ...p, engineerName: p.collectedBy?.name, collectedBy: p.collectedBy?._id })) });
});

exports.verify = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.id, ...scopeFor(req) });
  if (!sr) throw new ApiError(404, 'Service request not found');
  if (sr.status !== 'created') throw new ApiError(409, `Request is already ${sr.status}`);
  await verifyRequest(sr, req.user, req.body);
  res.json(sr);
});

exports.cancel = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.id, ...scopeFor(req) });
  if (!sr) throw new ApiError(404, 'Service request not found');
  res.json(await booking.cancelBooking(sr, req.user, req.body.reason));
});

exports.confirmClosure = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.id, customerId: req.customer._id });
  if (!sr) throw new ApiError(404, 'Service request not found');
  if (sr.status !== 'approved') throw new ApiError(409, 'Service is not ready for closure confirmation');
  sr.status = 'closed';
  sr.closedAt = new Date();
  sr.rating = req.body.rating;
  sr.feedback = req.body.feedback;
  await sr.save();
  res.json(sr);
});

/** Start of the requested window, or null for all time. */
const periodStart = (period) => {
  const d = new Date();
  if (period === 'today') { d.setHours(0, 0, 0, 0); return d; }
  if (period === 'week') { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6); return d; }
  if (period === 'month') { d.setHours(0, 0, 0, 0); d.setDate(1); return d; }
  return null;
};

/** Cards/pie follow `period` (overall | today | week | month); the 6-month trend always shows the full history. */
async function buildStats(scope, period = 'overall') {
  const everything = await ServiceRequest.find(scope).select('status createdAt approvedAt closedAt tatDueAt warranty repeatOf slaBreached priority city').lean();
  const from = periodStart(period);
  const all = from ? everything.filter((s) => s.createdAt >= from) : everything;
  const done = (s) => ['approved', 'closed'].includes(s.status);
  const open = all.filter((s) => !done(s) && !['cancelled', 'failed'].includes(s.status));
  const finished = all.filter(done);
  const tat = finished.filter((s) => s.approvedAt).map((s) => (s.approvedAt - s.createdAt) / 3600000);
  const now = Date.now();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleString('en-US', { month: 'short' }), requests: 0, closed: 0 });
  }
  const bucket = (d) => months.find((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`);
  everything.forEach((s) => { const b = bucket(new Date(s.createdAt)); if (b) { b.requests += 1; if (done(s)) b.closed += 1; } });

  const label = { Completed: finished.length, 'In Progress': all.filter((s) => ['assigned', 'in_progress', 'under_review', 'offered'].includes(s.status)).length, Pending: all.filter((s) => ['created', 'verified', 'unassigned'].includes(s.status)).length, Breached: open.filter((s) => s.slaBreached || (s.tatDueAt && s.tatDueAt < now)).length };
  return {
    total: all.length, open: open.length, closed: finished.length,
    breaches: label.Breached, warrantyCalls: all.filter((s) => s.warranty === 'warranty').length,
    avgTatHours: tat.length ? Math.round((tat.reduce((a, b) => a + b, 0) / tat.length) * 10) / 10 : 0,
    repeatPercent: all.length ? Math.round((all.filter((s) => s.repeatOf).length / all.length) * 100) : 0,
    firstTimeFixPercent: finished.length ? Math.round((1 - all.filter((s) => s.repeatOf).length / finished.length) * 100) : 0,
    monthly: months.map(({ key, ...m }) => m),
    statusBreakdown: Object.entries(label).map(([name, value]) => ({ name, value })),
  };
}

exports.buildStats = buildStats;
exports.stats = asyncHandler(async (req, res) => res.json(await buildStats(scopeFor(req), req.query.period)));

exports.sla = asyncHandler(async (req, res) => {
  const list = await ServiceRequest.find({ ...scopeFor(req), status: { $nin: ['approved', 'closed', 'cancelled', 'failed'] }, tatDueAt: { $ne: null } }).populate(POPULATE).sort({ tatDueAt: 1 }).lean();
  const now = Date.now();
  const items = list.map((s) => {
    const total = s.tatDueAt - s.createdAt;
    const left = s.tatDueAt - now;
    const progress = Math.min(100, Math.max(0, Math.round(((now - s.createdAt) / total) * 100)));
    const h = Math.abs(left) / 3600000;
    const text = h >= 24 ? `${Math.floor(h / 24)}d ${Math.round(h % 24)}h` : `${Math.round(h * 10) / 10}h`;
    return {
      id: s._id, sr: s.srNumber, customer: s.customerName, vendor: s.vendorId?.legalName || '—', priority: s.priority, progress,
      due: left < 0 ? `Breached ${text} ago` : `${text} left`, status: left < 0 ? 'Breached' : progress >= 80 ? 'At Risk' : 'On Track',
    };
  });
  res.json({ items, total: items.length });
});

exports.scopeFor = scopeFor;
exports.verifyRequest = verifyRequest;
