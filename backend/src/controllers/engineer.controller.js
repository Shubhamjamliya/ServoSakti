const bcrypt = require('bcryptjs');
const Engineer = require('../models/Engineer');
const { phoneTaken } = require('../models/accounts');
const ServiceRequest = require('../models/ServiceRequest');
const Payout = require('../models/Payout');
const DayLog = require('../models/DayLog');
const { ApiError, asyncHandler, paginate, istDate } = require('../utils/helpers');
const { cashHeld } = require('../services/payment.service');
const { notify, notifyAdmins, audit } = require('../services/realtime');

const scope = (req) => (req.user.role === 'admin' ? {} : { companyId: req.user.companyId });
const EDITABLE = ['name', 'skills', 'certifications', 'city', 'serviceTerritories', 'available', 'active', 'kyc', 'serviceZones'];
const pick = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => keys.includes(k)));

exports.list = asyncHandler(async (req, res) => {
  const data = await paginate(Engineer, scope(req), req, { search: ['name', 'phone', 'city'], filters: ['status', 'engineerType', 'companyId'], populate: { path: 'companyId', select: 'legalName' } });
  // live status for tracking: today's Day Start and calls currently open
  const ids = data.items.map((e) => e._id);
  const [days, cash, open] = await Promise.all([
    DayLog.find({ engineerId: { $in: ids }, date: istDate() }).lean(),
    cashHeld(ids), // customer cash collected on site and not yet deposited
    ServiceRequest.aggregate([{ $match: { engineerId: { $in: ids }, status: { $in: ['assigned', 'in_progress', 'under_review'] } } }, { $group: { _id: '$engineerId', n: { $sum: 1 } } }]),
  ]);
  const dayMap = new Map(days.map((d) => [String(d.engineerId), d]));
  const openMap = new Map(open.map((o) => [String(o._id), o.n]));
  data.items = data.items.map((e) => {
    const day = dayMap.get(String(e._id));
    return { ...e, companyName: e.companyId?.legalName, companyId: e.companyId?._id, dayStatus: !day ? 'Not started' : day.closedAt ? 'Closed' : 'Started', dayStartedAt: day?.startedAt, openCalls: openMap.get(String(e._id)) || 0, cashHeld: cash.get(String(e._id)) || 0 };
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

/*
 * Profile editing by the engineer.
 *   saved at once      photo, email, skills, travel areas, service zones (and live location / availability)
 *   needs approval     name, base city, brand certifications — they decide which calls the engineer is trusted with
 * Approval-field edits are parked in `pendingChanges` for the service company (or admin, for independent engineers).
 */
const DIRECT = ['avatar', 'email', 'skills', 'serviceTerritories', 'serviceZones', 'available'];
const NEEDS_APPROVAL = ['name', 'city', 'certifications'];
const clean = (v) => (typeof v === 'string' ? v.trim() : v);
const sameCerts = (a = [], b = []) => JSON.stringify(a.map((c) => [c.brand, c.docUrl || ''])) === JSON.stringify(b.map((c) => [c.brand, c.docUrl || '']));

exports.updateMe = asyncHandler(async (req, res) => {
  const eng = req.engineer;
  const patch = Object.fromEntries(Object.entries(pick(req.body, DIRECT)).map(([k, v]) => [k, clean(v)]));
  if (req.body.location) patch.location = { ...req.body.location, at: new Date() };

  // only real changes to approval fields become a request
  const asked = {};
  for (const k of NEEDS_APPROVAL) {
    if (!(k in req.body)) continue;
    if (k === 'certifications') {
      const certs = (req.body.certifications || []).map((c) => ({ brand: String(c.brand || '').trim(), docUrl: c.docUrl })).filter((c) => c.brand);
      if (!certs.length) throw new ApiError(400, 'Keep at least one brand certification');
      if (!sameCerts(certs, eng.certifications)) asked.certifications = certs;
    } else {
      const v = clean(req.body[k]);
      if (!v) throw new ApiError(400, `${k === 'name' ? 'Name' : 'City'} cannot be empty`);
      if (v !== eng[k]) asked[k] = v;
    }
  }
  if (Object.keys(asked).length) {
    patch.pendingChanges = { ...(eng.pendingChanges || {}), ...asked, requestedAt: new Date(), note: clean(req.body.note) };
    const what = Object.keys(asked).map((k) => ({ name: 'name', city: 'city', certifications: 'brand certifications' }[k])).join(', ');
    const msg = `${eng.name} asked to change ${what}`;
    if (eng.companyId) await notify([eng.companyId], 'Engineer profile change', msg, 'approval');
    else await notifyAdmins('Engineer profile change', msg, 'approval');
    audit(req.user, 'engineer.changes.request', 'Engineer', eng._id, asked);
  }
  const updated = await Engineer.findByIdAndUpdate(eng._id, patch, { new: true });
  res.json({ ...updated.toObject(), approvalRequested: Object.keys(asked) });
});

/** Engineer withdraws their own pending request. */
exports.cancelChanges = asyncHandler(async (req, res) => {
  res.json(await Engineer.findByIdAndUpdate(req.engineer._id, { $unset: { pendingChanges: 1 } }, { new: true }));
});

/** Service company (its own engineers) or admin approves / rejects a pending profile change. */
exports.decideChanges = asyncHandler(async (req, res) => {
  const { decision, note } = req.body;
  if (!['approve', 'reject'].includes(decision)) throw new ApiError(400, 'decision must be approve or reject');
  const eng = await Engineer.findOne({ _id: req.params.id, ...scope(req) });
  if (!eng) throw new ApiError(404, 'Engineer not found');
  const pending = eng.pendingChanges;
  if (!pending) throw new ApiError(409, 'No profile change is waiting');
  if (decision === 'approve') NEEDS_APPROVAL.forEach((k) => { if (pending[k] !== undefined) eng[k] = pending[k]; });
  eng.pendingChanges = undefined;
  await eng.save();
  audit(req.user, `engineer.changes.${decision}`, 'Engineer', eng._id, { pending, note });
  await notify([eng._id], decision === 'approve' ? 'Profile change approved' : 'Profile change not approved', note || (decision === 'approve' ? 'Your profile is updated.' : 'Contact your service company for details.'), 'approval');
  res.json(eng);
});

/**
 * Online / offline. Going online starts the day (GPS) if it has not started yet and makes the engineer available for
 * dispatch; going offline stops new offers (jobs already accepted stay with them).
 */
exports.setDuty = asyncHandler(async (req, res) => {
  const online = !!req.body.online;
  const eng = req.engineer;
  let day = await DayLog.findOne({ engineerId: eng._id, date: istDate() });
  if (online) {
    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') throw new ApiError(400, 'Your location is needed to go online');
    if (day?.closedAt) throw new ApiError(409, 'Your day has been closed. You can go online again tomorrow.');
    if (!day) day = await DayLog.create({ engineerId: eng._id, date: istDate(), startedAt: new Date(), startLocation: { lat, lng } });
    eng.location = { lat, lng, at: new Date() };
  }
  eng.available = online;
  await eng.save();
  audit(req.user, online ? 'engineer.online' : 'engineer.offline', 'Engineer', eng._id);
  res.json({ online, available: eng.available, day });
});
