const bcrypt = require('bcryptjs');
const Engineer = require('../models/Engineer');
const { phoneTaken } = require('../models/accounts');
const ServiceRequest = require('../models/ServiceRequest');
const Payout = require('../models/Payout');
const DayLog = require('../models/DayLog');
const { ApiError, asyncHandler, paginate, istDate } = require('../utils/helpers');
const { notify, notifyAdmins, audit } = require('../services/realtime');

const scope = (req) => (req.user.role === 'admin' ? {} : { companyId: req.user.companyId });
const EDITABLE = ['name', 'skills', 'certifications', 'city', 'serviceTerritories', 'available', 'active', 'kyc'];
const pick = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => keys.includes(k)));

exports.list = asyncHandler(async (req, res) => {
  const data = await paginate(Engineer, scope(req), req, { search: ['name', 'phone', 'city'], filters: ['status', 'engineerType', 'companyId'], populate: { path: 'companyId', select: 'legalName' } });
  // live status for tracking: today's Day Start and calls currently open
  const ids = data.items.map((e) => e._id);
  const [days, open] = await Promise.all([
    DayLog.find({ engineerId: { $in: ids }, date: istDate() }).lean(),
    ServiceRequest.aggregate([{ $match: { engineerId: { $in: ids }, status: { $in: ['assigned', 'in_progress', 'under_review'] } } }, { $group: { _id: '$engineerId', n: { $sum: 1 } } }]),
  ]);
  const dayMap = new Map(days.map((d) => [String(d.engineerId), d]));
  const openMap = new Map(open.map((o) => [String(o._id), o.n]));
  data.items = data.items.map((e) => {
    const day = dayMap.get(String(e._id));
    return { ...e, companyName: e.companyId?.legalName, companyId: e.companyId?._id, dayStatus: !day ? 'Not started' : day.closedAt ? 'Closed' : 'Started', dayStartedAt: day?.startedAt, openCalls: openMap.get(String(e._id)) || 0 };
  });
  res.json(data);
});

/** Vendor owner adds an engineer to their company; it stays pending until admin verifies KYC/certifications. */
exports.create = asyncHandler(async (req, res) => {
  const { name, phone, email, password } = req.body;
  if (!name || !/^\d{10}$/.test(String(phone || ''))) throw new ApiError(400, 'Name and a valid 10-digit phone are required');
  if (await phoneTaken('engineer', phone)) throw new ApiError(409, 'An engineer with this phone number already exists');
  if (!password || password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
  const eng = await Engineer.create({
    ...pick(req.body, EDITABLE), name, phone, email, passwordHash: await bcrypt.hash(password, 10),
    companyId: req.user.companyId, engineerType: 'company', status: 'pending',
  });
  notifyAdmins('Engineer awaiting approval', `${name} was added by a service company`, 'approval');
  const { passwordHash, ...out } = eng.toObject();
  res.status(201).json(out);
});

/** `active: false` blocks the engineer's login immediately (the auth middleware re-checks it on every request). */
exports.update = asyncHandler(async (req, res) => {
  const eng = await Engineer.findOneAndUpdate({ _id: req.params.id, ...scope(req) }, pick(req.body, EDITABLE), { new: true, runValidators: true });
  if (!eng) throw new ApiError(404, 'Engineer not found');
  res.json(eng);
});

exports.setStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  if (!['pending', 'approved', 'suspended', 'rejected'].includes(status)) throw new ApiError(400, 'Invalid status');
  const eng = await Engineer.findByIdAndUpdate(req.params.id, { status, statusReason: reason }, { new: true });
  if (!eng) throw new ApiError(404, 'Engineer not found');
  audit(req.user, `engineer.${status}`, 'Engineer', eng._id, { reason });
  notify([eng._id], `Profile ${status}`, reason || `Your engineer profile is now ${status}`, 'approval');
  res.json(eng);
});

/** Vendor owner / admin view of one engineer's performance. */
exports.performance = asyncHandler(async (req, res) => {
  const eng = await Engineer.findOne({ _id: req.params.id, ...scope(req) }).lean();
  if (!eng) throw new ApiError(404, 'Engineer not found');
  const [byStatus, earned] = await Promise.all([
    ServiceRequest.aggregate([{ $match: { engineerId: eng._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Payout.aggregate([{ $match: { engineerId: eng._id } }, { $group: { _id: null, total: { $sum: '$engineerAmount' } } }]),
  ]);
  res.json({ engineer: eng, byStatus, earnings: earned[0]?.total || 0 });
});

/* ---- the logged-in engineer ---- */
exports.me = asyncHandler(async (req, res) => res.json(req.engineer));

exports.updateMe = asyncHandler(async (req, res) => {
  const patch = pick(req.body, ['available', 'skills', 'city', 'serviceTerritories', 'certifications']);
  if (req.body.location) patch.location = { ...req.body.location, at: new Date() };
  res.json(await Engineer.findByIdAndUpdate(req.engineer._id, patch, { new: true }));
});
