const Customer = require('../models/Customer');
const ServiceRequest = require('../models/ServiceRequest');
const ProductPassport = require('../models/ProductPassport');
const Notification = require('../models/Notification');
const { ApiError, asyncHandler, paginate } = require('../utils/helpers');
const { detectZone, hasActiveZones } = require('../services/zone.service');

exports.list = asyncHandler(async (req, res) => {
  const data = await paginate(Customer, {}, req, { search: ['name', 'phone'] });
  const counts = await ServiceRequest.aggregate([{ $match: { customerId: { $in: data.items.map((c) => c._id) } } }, { $group: { _id: '$customerId', n: { $sum: 1 } } }]);
  const map = new Map(counts.map((c) => [String(c._id), c.n]));
  data.items = data.items.map((c) => ({ ...c, requests: map.get(String(c._id)) || 0, addressCount: c.addresses?.length || 0 }));
  res.json(data);
});

exports.me = asyncHandler(async (req, res) => res.json(req.customer));

exports.updateMe = asyncHandler(async (req, res) => {
  const patch = {};
  if (req.body.name) patch.name = req.body.name.trim();
  if (req.body.email !== undefined) patch.email = req.body.email.trim();
  if (req.body.avatar !== undefined) patch.avatar = req.body.avatar;
  if (Array.isArray(req.body.addresses)) patch.addresses = req.body.addresses;
  res.json(await Customer.findByIdAndUpdate(req.customer._id, patch, { new: true }));
});

exports.deleteMe = asyncHandler(async (req, res) => {
  const customerId = req.customer._id;
  await Promise.all([
    Customer.findByIdAndDelete(customerId),
    ProductPassport.deleteMany({ customerId }),
    Notification.deleteMany({ userId: customerId }),
  ]);
  res.json({ ok: true, message: 'Account deleted successfully' });
});

/* ---- saved service addresses (picked on the map; each is matched to a service zone) ---- */
const ADDRESS_FIELDS = ['label', 'line', 'landmark', 'city', 'state', 'pincode', 'lat', 'lng'];

async function buildAddress(body) {
  const a = Object.fromEntries(Object.entries(body).filter(([k]) => ADDRESS_FIELDS.includes(k)));
  if (!a.line || !a.city) throw new ApiError(400, 'Address and city are required');
  a.lat = Number(a.lat);
  a.lng = Number(a.lng);
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) throw new ApiError(400, 'Pick the location on the map');
  const zone = await detectZone(a.lat, a.lng);
  if (!zone && (await hasActiveZones())) throw new ApiError(422, 'Sorry, we do not serve this location yet');
  return { ...a, zoneId: zone?._id, zoneName: zone?.name };
}

exports.addAddress = asyncHandler(async (req, res) => {
  const c = await Customer.findById(req.customer._id);
  if (c.addresses && c.addresses.length >= 3) {
    throw new ApiError(400, 'You can save up to 3 addresses. Edit or remove an existing address to add a new one.');
  }
  const addr = await buildAddress(req.body);
  addr.isDefault = !c.addresses.length || req.body.isDefault === true;
  if (addr.isDefault) c.addresses.forEach((x) => { x.isDefault = false; });
  c.addresses.push(addr);
  await c.save();
  res.status(201).json(c);
});

exports.updateAddress = asyncHandler(async (req, res) => {
  const c = await Customer.findById(req.customer._id);
  const cur = c.addresses.id(req.params.addressId);
  if (!cur) throw new ApiError(404, 'Address not found');
  cur.set(await buildAddress({ ...cur.toObject(), ...req.body }));
  if (req.body.isDefault === true) c.addresses.forEach((x) => { x.isDefault = String(x._id) === String(cur._id); });
  await c.save();
  res.json(c);
});

exports.removeAddress = asyncHandler(async (req, res) => {
  const c = await Customer.findById(req.customer._id);
  const cur = c.addresses.id(req.params.addressId);
  if (!cur) throw new ApiError(404, 'Address not found');
  const wasDefault = cur.isDefault;
  cur.deleteOne();
  if (wasDefault && c.addresses[0]) c.addresses[0].isDefault = true;
  await c.save();
  res.json(c);
});
