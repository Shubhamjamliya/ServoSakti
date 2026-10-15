const ServiceRequest = require('../models/ServiceRequest');
const DispatchLog = require('../models/DispatchLog');
const Engineer = require('../models/Engineer');
const Vendor = require('../models/Vendor');
const Authorization = require('../models/Authorization');
const Setting = require('../models/Setting');
const { ApiError, asyncHandler, paginate } = require('../utils/helpers');
const dispatch = require('../services/dispatch.service');
const { scopeFor } = require('./serviceRequest.controller');
const { notifyCompany, audit } = require('../services/realtime');

const logScope = async (req) => {
  const { role } = req.user;
  if (role === 'admin') return {};
  const ids = (await ServiceRequest.find(scopeFor(req)).select('_id').lean()).map((s) => s._id);
  return { serviceRequestId: { $in: ids } };
};

/** Admin/OEM manually (re)starts automatic dispatch, e.g. after the queue was exhausted. */
exports.start = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.srId, ...scopeFor(req) });
  if (!sr) throw new ApiError(404, 'Service request not found');
  if (!['verified', 'unassigned'].includes(sr.status)) throw new ApiError(409, `Cannot dispatch a request that is ${sr.status}`);
  const offer = await dispatch.startDispatch(sr, req.user.id);
  res.json({ status: sr.status, offer });
});

exports.logs = asyncHandler(async (req, res) => {
  res.json(await paginate(DispatchLog, await logScope(req), req, { search: ['srNumber', 'candidateName', 'reason'], filters: ['outcome', 'priority'], sort: { createdAt: -1 } }));
});

/** Pending offers addressed to the caller (engineer) or their company (vendor owner). */
exports.myOffers = asyncHandler(async (req, res) => {
  const filter = { outcome: 'pending', expiresAt: { $gt: new Date() } };
  if (req.user.role === 'engineer') filter.candidateEngineerId = req.engineer._id;
  else filter.candidateCompanyId = req.user.companyId;
  const offers = await DispatchLog.find(filter).sort({ offeredAt: -1 }).lean();
  const srs = await ServiceRequest.find({ _id: { $in: offers.map((o) => o.serviceRequestId) } }).select('srNumber brand model city jobType priority issue warranty').lean();
  const map = new Map(srs.map((s) => [String(s._id), s]));
  res.json({ items: offers.map((o) => ({ ...o, sr: map.get(String(o.serviceRequestId)) })), total: offers.length });
});

exports.accept = asyncHandler(async (req, res) => {
  const log = await DispatchLog.findById(req.params.logId);
  if (!log) throw new ApiError(404, 'Offer not found');
  res.json(await dispatch.acceptOffer(log, req.user, req.engineer, req.body));
});

exports.reject = asyncHandler(async (req, res) => {
  const log = await DispatchLog.findById(req.params.logId);
  if (!log) throw new ApiError(404, 'Offer not found');
  res.json(await dispatch.rejectOffer(log, req.user, req.engineer, req.body.reason));
});

/** Vendor owner assigns one of their own engineers (own-company call) — or admin/OEM override. */
exports.assign = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.srId, ...scopeFor(req) });
  if (!sr) throw new ApiError(404, 'Service request not found');
  if (!['verified', 'offered', 'unassigned', 'assigned'].includes(sr.status)) throw new ApiError(409, `Cannot assign a request that is ${sr.status}`);
  const eng = await Engineer.findOne({ _id: req.body.engineerId, status: 'approved', active: true });
  if (!eng) throw new ApiError(400, 'Engineer not found or not approved');
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && String(eng.companyId) !== req.user.companyId) throw new ApiError(403, 'You can only assign your own engineers');
  await DispatchLog.updateMany({ serviceRequestId: sr._id, outcome: 'pending' }, { outcome: 'override', reason: 'Superseded by manual assignment', respondedAt: new Date() });
  await dispatch.assign(sr, eng, {
    origin: String(eng.companyId) === String(sr.vendorId) ? 'own' : sr.origin === 'outsourced' ? 'outsourced' : 'platform',
    actorId: req.user.id, outcome: isAdmin ? 'override' : 'assigned', reason: req.body.reason || (isAdmin ? 'Admin override' : 'Assigned by service company'),
  });
  audit(req.user, isAdmin ? 'dispatch.override' : 'dispatch.assign', 'ServiceRequest', sr._id, { engineerId: String(eng._id) });
  res.json(sr);
});

/** Vendor owner asks an outside-location partner company to take the call. */
exports.outsource = asyncHandler(async (req, res) => {
  const sr = await ServiceRequest.findOne({ _id: req.params.srId, ...scopeFor(req) });
  if (!sr) throw new ApiError(404, 'Service request not found');
  if (!['verified', 'offered', 'unassigned'].includes(sr.status)) throw new ApiError(409, `Cannot outsource a request that is ${sr.status}`);
  const partner = await Vendor.findOne({ _id: req.body.companyId, status: 'approved' });
  if (!partner) throw new ApiError(400, 'Partner company not found');
  if (!(await Authorization.exists({ oemId: sr.oemId, vendorId: partner._id, status: 'active' }))) throw new ApiError(400, 'Partner is not authorized by this OEM');
  const settings = await Setting.get();
  const now = new Date();
  sr.dispatch.outsourced = true;
  sr.outsourcedBy = req.user.companyId;
  sr.status = 'offered';
  await sr.save();
  await DispatchLog.updateMany({ serviceRequestId: sr._id, outcome: 'pending' }, { outcome: 'override', reason: 'Outsourced to partner', respondedAt: now });
  const log = await DispatchLog.create({
    serviceRequestId: sr._id, srNumber: sr.srNumber, candidateCompanyId: partner._id, candidateName: partner.legalName, priority: 3,
    offeredAt: now, expiresAt: new Date(now.getTime() + settings.acceptanceWindowMinutes * 60000), outcome: 'pending', actorId: req.user.id, reason: req.body.reason,
  });
  await notifyCompany(partner._id, 'Partner job request', `${sr.srNumber} · ${sr.brand || ''} ${sr.city || ''} needs coverage`, 'offer');
  audit(req.user, 'dispatch.outsource', 'ServiceRequest', sr._id, { partner: String(partner._id) });
  res.status(201).json(log);
});
