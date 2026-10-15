const Engineer = require('../models/Engineer');
const Vendor = require('../models/Vendor');
const Authorization = require('../models/Authorization');
const ServiceRequest = require('../models/ServiceRequest');
const DispatchLog = require('../models/DispatchLog');
const DayLog = require('../models/DayLog');
const Setting = require('../models/Setting');
const { ApiError, ci, istDate, haversineKm } = require('../utils/helpers');
const { notify, notifyAdmins, notifyCompany, audit } = require('./realtime');

const OPEN = ['assigned', 'in_progress', 'under_review'];

/**
 * Builds the ordered candidate queue for a service request.
 *  1 same-company local engineer  2 same-city independent engineer
 *  3 nearby authorized partner company  4 backup / emergency partner
 * Distance alone never qualifies anyone: brand certification, availability, load, radius and OEM authorization must all pass.
 */
async function buildQueue(sr, settings) {
  const brandOk = (e) => !sr.brand || e.certifications.some((c) => c.brand && ci(sr.brand).test(c.brand));
  const cityOk = (e) => !sr.city || (e.city && ci(sr.city).test(e.city)) || e.serviceTerritories.some((t) => ci(sr.city).test(t));
  const radiusOk = (e) => {
    const d = haversineKm(e.location, sr.location);
    return d === null || d <= settings.maxRadiusKm;
  };

  const loads = await ServiceRequest.aggregate([
    { $match: { status: { $in: OPEN }, engineerId: { $ne: null } } },
    { $group: { _id: '$engineerId', n: { $sum: 1 } } },
  ]);
  const load = new Map(loads.map((l) => [String(l._id), l.n]));
  const pending = await DispatchLog.find({ serviceRequestId: sr._id, outcome: { $in: ['rejected', 'timeout'] } }).lean();
  const skipEng = new Set(pending.map((p) => String(p.candidateEngineerId)));
  const skipCo = new Set(pending.map((p) => String(p.candidateCompanyId)));

  const eligible = (e) =>
    brandOk(e) && cityOk(e) && radiusOk(e) && (load.get(String(e._id)) || 0) < settings.maxEngineerLoad && !skipEng.has(String(e._id));
  const base = { status: 'approved', active: true, available: true };
  const byLoad = (a, b) => (load.get(String(a._id)) || 0) - (load.get(String(b._id)) || 0);

  const queue = [];
  const used = new Set();
  const push = (kind, doc, priority) => {
    if (used.has(`${kind}:${doc._id}`)) return;
    used.add(`${kind}:${doc._id}`);
    queue.push({ kind, id: doc._id, priority });
  };

  if (sr.vendorId) {
    (await Engineer.find({ ...base, companyId: sr.vendorId }).lean()).filter(eligible).sort(byLoad).forEach((e) => push('engineer', e, 1));
  }
  (await Engineer.find({ ...base, engineerType: 'independent' }).lean()).filter(eligible).sort(byLoad).forEach((e) => push('engineer', e, 2));

  const auths = await Authorization.find({ oemId: sr.oemId, status: 'active' }).lean();
  const approvedCompanies = new Set(
    (await Vendor.find({ _id: { $in: auths.map((a) => a.vendorId) }, status: 'approved' }).select('_id').lean()).map((c) => String(c._id))
  );
  const covers = (a) =>
    approvedCompanies.has(String(a.vendorId)) &&
    String(a.vendorId) !== String(sr.vendorId) &&
    !skipCo.has(String(a.vendorId)) &&
    (!sr.brand || a.brands.some((b) => ci(sr.brand).test(b)));
  auths.filter((a) => !a.backup && covers(a) && (!sr.city || a.cities.some((c) => ci(sr.city).test(c)))).forEach((a) => push('company', { _id: a.vendorId }, 3));
  auths.filter((a) => a.backup && covers(a)).forEach((a) => push('company', { _id: a.vendorId }, 4));

  return queue;
}

/** Creates the next offer in the queue, or marks the request unassigned when the queue is exhausted. */
async function offerNext(sr, settings) {
  settings = settings || (await Setting.get());
  const queue = sr.dispatch.queue;
  if (sr.dispatch.index >= queue.length) {
    sr.status = 'unassigned';
    await sr.save();
    await notifyAdmins('No engineer available', `${sr.srNumber} could not be assigned automatically`, 'dispatch');
    return null;
  }
  const item = queue[sr.dispatch.index];
  sr.dispatch.index += 1;
  sr.status = 'offered';
  await sr.save();

  const now = new Date();
  const log = { serviceRequestId: sr._id, srNumber: sr.srNumber, priority: item.priority, offeredAt: now, expiresAt: new Date(now.getTime() + settings.acceptanceWindowMinutes * 60000), outcome: 'pending' };
  if (item.kind === 'engineer') {
    const eng = await Engineer.findById(item.id).lean();
    Object.assign(log, { candidateEngineerId: eng._id, candidateName: eng.name });
    await notify([eng._id], 'New job offer', `${sr.srNumber} · ${sr.brand || ''} ${sr.city || ''} — accept within ${settings.acceptanceWindowMinutes} min`, 'offer');
  } else {
    const co = await Vendor.findById(item.id).lean();
    Object.assign(log, { candidateCompanyId: co._id, candidateName: co.legalName });
    await notifyCompany(co._id, 'Partner job request', `${sr.srNumber} · ${sr.brand || ''} ${sr.city || ''} needs coverage`, 'offer');
  }
  return DispatchLog.create(log);
}

async function startDispatch(sr, actorId) {
  const settings = await Setting.get();
  sr.dispatch = { queue: await buildQueue(sr, settings), index: 0 };
  audit(actorId, 'dispatch.start', 'ServiceRequest', sr._id, { queue: sr.dispatch.queue.length });
  return offerNext(sr, settings);
}

const assign = async (sr, eng, { origin, actorId, priority = 0, outcome = 'assigned', reason }) => {
  sr.engineerId = eng._id;
  sr.vendorId = eng.companyId || sr.vendorId;
  sr.origin = origin;
  sr.status = 'assigned';
  await sr.save();
  await DispatchLog.create({
    serviceRequestId: sr._id, srNumber: sr.srNumber, candidateEngineerId: eng._id, candidateName: eng.name, priority,
    offeredAt: new Date(), respondedAt: new Date(), outcome, reason, actorId,
  });
  await notify([eng._id], 'Job assigned', `${sr.srNumber} · ${sr.brand || ''} ${sr.city || ''}`, 'assignment');
};

async function acceptOffer(log, user, engineer, body = {}) {
  if (log.outcome !== 'pending') throw new ApiError(409, 'Offer is no longer open');
  if (log.expiresAt < new Date()) throw new ApiError(409, 'Offer has expired');
  const sr = await ServiceRequest.findById(log.serviceRequestId);

  let eng;
  let origin = sr.dispatch.outsourced ? 'outsourced' : 'platform';
  if (log.candidateEngineerId) {
    if (!engineer || String(engineer._id) !== String(log.candidateEngineerId)) throw new ApiError(403, 'Not your offer');
    const day = await DayLog.findOne({ engineerId: engineer._id, date: istDate(), closedAt: null });
    if (!day) throw new ApiError(400, 'Day Start is required before accepting calls');
    eng = engineer;
    if (log.priority === 1) origin = 'own';
  } else {
    if (user.role !== 'vendor_owner' || String(user.companyId) !== String(log.candidateCompanyId)) throw new ApiError(403, 'Not your offer');
    eng = await Engineer.findOne({ _id: body.engineerId, companyId: user.companyId, status: 'approved', active: true });
    if (!eng) throw new ApiError(400, 'Choose one of your approved engineers');
    if (!sr.dispatch.outsourced) origin = 'partner';
  }
  log.outcome = 'accepted';
  log.respondedAt = new Date();
  await log.save();
  await assign(sr, eng, { origin, actorId: user.id, priority: log.priority, outcome: 'accepted' });
  audit(user, 'dispatch.accept', 'ServiceRequest', sr._id, { engineer: String(eng._id) });
  return sr;
}

async function rejectOffer(log, user, engineer, reason) {
  if (log.outcome !== 'pending') throw new ApiError(409, 'Offer is no longer open');
  const mine = log.candidateEngineerId ? engineer && String(engineer._id) === String(log.candidateEngineerId) : String(user.companyId) === String(log.candidateCompanyId);
  if (!mine) throw new ApiError(403, 'Not your offer');
  log.outcome = 'rejected';
  log.reason = reason || 'Rejected';
  log.respondedAt = new Date();
  await log.save();
  const sr = await ServiceRequest.findById(log.serviceRequestId);
  if (sr.status === 'offered') await offerNext(sr);
  return sr;
}

/** Called by the cron job: expired offers move to the next candidate and the reason is recorded. */
async function expireOffers() {
  const expired = await DispatchLog.find({ outcome: 'pending', expiresAt: { $lt: new Date() } });
  for (const log of expired) {
    log.outcome = 'timeout';
    log.reason = 'No response within acceptance window';
    log.respondedAt = new Date();
    await log.save();
    const sr = await ServiceRequest.findById(log.serviceRequestId);
    if (sr && sr.status === 'offered') await offerNext(sr);
  }
  return expired.length;
}

module.exports = { buildQueue, startDispatch, offerNext, acceptOffer, rejectOffer, expireOffers, assign };
