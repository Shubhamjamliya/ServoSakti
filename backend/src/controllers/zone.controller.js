const Zone = require('../models/Zone');
const Engineer = require('../models/Engineer');
const { Vendor } = require('../models/accounts');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { detectZone, hasActiveZones } = require('../services/zone.service');
const { audit } = require('../services/realtime');

const clean = (b) => {
  const out = {};
  ['name', 'city', 'state', 'country', 'maxRadiusKm', 'active'].forEach((k) => b[k] !== undefined && (out[k] = b[k]));
  if (b.coordinates !== undefined) {
    out.coordinates = (b.coordinates || []).map((c) => ({ latitude: Number(c.latitude ?? c.lat), longitude: Number(c.longitude ?? c.lng) }));
    if (out.coordinates.some((c) => !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude))) throw new ApiError(400, 'Zone coordinates must be numbers');
  }
  return out;
};

/** Public: active zones for pickers and map overlays. */
exports.listPublic = asyncHandler(async (req, res) => {
  res.json({ items: await Zone.find({ active: true }).sort({ name: 1 }).lean() });
});

/** Public: is this point inside a service zone? (same idea as OyeChotuu's /zones/detect) */
exports.detect = asyncHandler(async (req, res) => {
  const zone = await detectZone(req.query.lat, req.query.lng);
  const configured = await hasActiveZones();
  res.json({ status: zone ? 'IN_SERVICE' : configured ? 'OUT_OF_SERVICE' : 'NO_ZONES_CONFIGURED', zoneId: zone?._id || null, zone });
});

exports.list = asyncHandler(async (req, res) => {
  const items = await Zone.find().sort({ createdAt: -1 }).lean();
  const [eng, ven] = await Promise.all([
    Engineer.aggregate([{ $unwind: '$serviceZones' }, { $group: { _id: '$serviceZones', n: { $sum: 1 } } }]),
    Vendor.aggregate([{ $unwind: '$serviceZones' }, { $group: { _id: '$serviceZones', n: { $sum: 1 } } }]),
  ]);
  const e = new Map(eng.map((x) => [String(x._id), x.n]));
  const v = new Map(ven.map((x) => [String(x._id), x.n]));
  res.json({ items: items.map((z) => ({ ...z, engineers: e.get(String(z._id)) || 0, companies: v.get(String(z._id)) || 0 })), total: items.length, page: 1, limit: Math.max(items.length, 1) });
});

exports.create = asyncHandler(async (req, res) => {
  const doc = await Zone.create(clean(req.body));
  audit(req.user, 'zone.create', 'Zone', doc._id, { name: doc.name });
  res.status(201).json(doc);
});

exports.update = asyncHandler(async (req, res) => {
  const doc = await Zone.findByIdAndUpdate(req.params.id, clean(req.body), { new: true, runValidators: true });
  if (!doc) throw new ApiError(404, 'Zone not found');
  audit(req.user, 'zone.update', 'Zone', doc._id);
  res.json(doc);
});

exports.remove = asyncHandler(async (req, res) => {
  const doc = await Zone.findByIdAndDelete(req.params.id);
  if (!doc) throw new ApiError(404, 'Zone not found');
  await Promise.all([Engineer.updateMany({}, { $pull: { serviceZones: doc._id } }), Vendor.updateMany({}, { $pull: { serviceZones: doc._id } })]);
  audit(req.user, 'zone.delete', 'Zone', doc._id, { name: doc.name });
  res.json({ ok: true });
});

/** The logged-in engineer / service company picks the zones it covers. */
exports.setCoverage = asyncHandler(async (req, res) => {
  const ids = [...new Set((req.body.zoneIds || []).map(String))];
  const valid = (await Zone.find({ _id: { $in: ids }, active: true }).select('_id').lean()).map((z) => z._id);
  const isEngineer = req.user.role === 'engineer';
  const doc = await (isEngineer ? Engineer : Vendor).findByIdAndUpdate(isEngineer ? req.engineer._id : req.user.companyId, { serviceZones: valid }, { new: true });
  res.json({ serviceZones: doc.serviceZones });
});
