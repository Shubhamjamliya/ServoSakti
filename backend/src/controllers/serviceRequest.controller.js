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
const { ApiError, asyncHandler, paginate, ci } = require('../utils/helpers');
const dispatch = require('../services/dispatch.service');
const { notifyAdmins, notifyCompany, audit } = require('../services/realtime');

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
  if (settings.autoDispatch) await dispatch.startDispatch(sr, user.id);
  return sr;
}

exports.create = asyncHandler(async (req, res) => {
  const b = req.body;
  const settings = await Setting.get();
  const doc = {
    brand: b.brand, model: b.model, serialNumber: b.serialNumber, jobType: b.jobType || 'breakdown', priority: b.priority || 'Medium',
    issue: b.issue, city: b.city, address: b.address, location: b.location, complaintId: b.complaintId, warranty: 'non_warranty',
  };

  let passport = null;
  if (b.passportId) {
    passport = await ProductPassport.findById(b.passportId).lean();
    if (!passport) throw new ApiError(404, 'Product passport not found');
    if (req.user.role === 'customer' && String(passport.customerId) !== String(req.customer._id) && passport.customerPhone !== req.customer.phone) throw new ApiError(403, 'Not your product');
    Object.assign(doc, { passportId: passport._id, brand: passport.brand, model: passport.model, serialNumber: passport.serialNumber });
    if (passport.warrantyEnd && new Date(passport.warrantyEnd) >= new Date()) doc.warranty = 'warranty';
  }
  if (!doc.brand) throw new ApiError(400, 'Brand is required (select a product passport or enter the brand)');
  if (b.warranty && ['oem', 'admin'].includes(req.user.role)) doc.warranty = b.warranty; // OEM/admin may override the computed value

  if (req.user.role === 'customer') {
    const addr = req.customer.addresses?.[0];
    Object.assign(doc, { customerId: req.customer._id, customerName: req.customer.name, customerPhone: req.customer.phone });
    doc.city = doc.city || addr?.city;
    doc.address = doc.address || addr?.line;
  } else {
    Object.assign(doc, { customerName: b.customerName || passport?.customerName, customerPhone: b.customerPhone || passport?.customerPhone, customerId: passport?.customerId });
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
    const since = new Date(Date.now() - 30 * 86400000);
    const prev = await ServiceRequest.findOne({ oemId: doc.oemId, serialNumber: doc.serialNumber, status: { $in: ['approved', 'closed'] }, approvedAt: { $gte: since } }).sort({ approvedAt: -1 }).lean();
    if (prev) doc.repeatOf = prev._id;
  }

  doc.srNumber = `SR-${1000 + (await Counter.next('sr'))}`;
  doc.tatDueAt = new Date(Date.now() + (settings.slaHours?.[doc.priority] || 48) * 3600000);
  const sr = await ServiceRequest.create(doc);
  audit(req.user, 'sr.create', 'ServiceRequest', sr._id, { by: req.user.role });

  if (['oem', 'admin'].includes(req.user.role)) await verifyRequest(sr, req.user);
  else {
    await notifyCompany(sr.oemId, 'New service request', `${sr.srNumber} · ${sr.brand} ${sr.model || ''} (${sr.city || '—'})`, 'service');
    await notifyAdmins('New service request', `${sr.srNumber} awaiting verification`, 'service');
  }
  res.status(201).json(sr);
});

exports.list = asyncHandler(async (req, res) => {
  const filter = scopeFor(req);
  // outsourced=1: calls handed to a partner (even before they accept) plus partner jobs received from others
  if (req.query.outsourced === '1') filter.$and = [{ $or: [{ outsourcedBy: { $ne: null } }, { origin: { $in: ['outsourced', 'partner'] } }] }];
  const data = await paginate(ServiceRequest, filter, req, {
    search: ['srNumber', 'customerName', 'brand', 'model', 'city', 'serialNumber'], filters: ['status', 'priority', 'city', 'jobType', 'origin', 'warranty'],
    populate: POPULATE,
  });
  data.items = data.items.map(shape);
  res.json(data);
});

exports.get = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.id, ...scopeFor(req) }).populate(POPULATE).lean();
  if (!sr) throw new ApiError(404, 'Service request not found');
  const [report, logs] = await Promise.all([
    FieldReport.findOne({ serviceRequestId: sr._id }).lean(),
    req.user.role === 'engineer' || req.user.role === 'customer' ? [] : DispatchLog.find({ serviceRequestId: sr._id }).sort({ createdAt: 1 }).lean(),
  ]);
  const out = shape(sr);
  if (out.otp) delete out.otp.code; // never leak the OTP to API consumers other than the customer's own channel
  res.json({ ...out, report, dispatchLogs: logs });
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
  if (!['created', 'verified', 'offered', 'unassigned', 'assigned'].includes(sr.status)) throw new ApiError(409, 'Cannot cancel at this stage');
  sr.status = 'cancelled';
  sr.reviewNote = req.body.reason;
  await sr.save();
  await DispatchLog.updateMany({ serviceRequestId: sr._id, outcome: 'pending' }, { outcome: 'rejected', reason: 'Request cancelled' });
  audit(req.user, 'sr.cancel', 'ServiceRequest', sr._id, { reason: req.body.reason });
  res.json(sr);
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
  const open = all.filter((s) => !done(s) && s.status !== 'cancelled');
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
  const list = await ServiceRequest.find({ ...scopeFor(req), status: { $nin: ['approved', 'closed', 'cancelled'] }, tatDueAt: { $ne: null } }).populate(POPULATE).sort({ tatDueAt: 1 }).lean();
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
