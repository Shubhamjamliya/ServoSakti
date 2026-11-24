const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const { ApiError, asyncHandler, paginate } = require('../utils/helpers');
const { audit } = require('../services/realtime');

const FIELDS = ['code', 'title', 'description', 'type', 'value', 'maxDiscount', 'minOrder', 'validFrom', 'validTo', 'usageLimit', 'perCustomerLimit', 'firstBookingOnly', 'jobTypes', 'subtypeIds', 'active'];
const pick = (body) => Object.fromEntries(Object.entries(body).filter(([k, v]) => FIELDS.includes(k) && v !== '' && v !== null));

function check(c) {
  if (c.type === 'percent' && (c.value <= 0 || c.value > 100)) throw new ApiError(400, 'A percentage must be between 1 and 100');
  if (c.type === 'flat' && !(c.value > 0)) throw new ApiError(400, 'Enter the discount amount');
  if (c.validFrom && c.validTo && new Date(c.validTo) < new Date(c.validFrom)) throw new ApiError(400, 'The end date is before the start date');
}

/** Admin: all coupons with how often each was used. */
exports.list = asyncHandler(async (req, res) => {
  const data = await paginate(Coupon, {}, req, { search: ['code', 'title'], filters: ['active', 'type'] });
  const now = new Date();
  data.items = data.items.map((c) => ({
    ...c,
    state: !c.active ? 'Inactive' : c.validTo && c.validTo < now ? 'Expired' : c.validFrom && c.validFrom > now ? 'Scheduled' : c.usageLimit && c.usedCount >= c.usageLimit ? 'Used up' : 'Live',
  }));
  res.json(data);
});

exports.create = asyncHandler(async (req, res) => {
  const body = pick(req.body);
  check(body);
  const c = await Coupon.create(body);
  audit(req.user, 'coupon.create', 'Coupon', c._id, { code: c.code });
  res.status(201).json(c);
});

exports.update = asyncHandler(async (req, res) => {
  const body = pick(req.body);
  delete body.code; // the code customers type never changes once created
  const cur = await Coupon.findById(req.params.id);
  if (!cur) throw new ApiError(404, 'Coupon not found');
  check({ ...cur.toObject(), ...body });
  cur.set(body);
  // optional limits can be cleared again (sent as null)
  ['validFrom', 'validTo', 'usageLimit', 'maxDiscount'].forEach((k) => { if (req.body[k] === null) cur.set(k, undefined); });
  await cur.save();
  audit(req.user, 'coupon.update', 'Coupon', cur._id, body);
  res.json(cur);
});

exports.redemptions = asyncHandler(async (req, res) => {
  res.json(await paginate(CouponRedemption, { couponId: req.params.id }, req, { search: ['srNumber'], filters: ['status'], populate: { path: 'customerId', select: 'name phone' } }));
});

/** Customer: live coupons they could use (shown on the booking screen). */
exports.available = asyncHandler(async (req, res) => {
  const now = new Date();
  const list = await Coupon.find({
    active: true,
    $and: [{ $or: [{ validFrom: null }, { validFrom: { $lte: now } }] }, { $or: [{ validTo: null }, { validTo: { $gte: now } }] }],
  }).select('code title description type value maxDiscount minOrder firstBookingOnly jobTypes usageLimit usedCount perCustomerLimit').lean();
  const used = await CouponRedemption.aggregate([{ $match: { customerId: req.customer._id, status: 'applied' } }, { $group: { _id: '$couponId', n: { $sum: 1 } } }]);
  const usedMap = new Map(used.map((u) => [String(u._id), u.n]));
  res.json({ items: list.filter((c) => (!c.usageLimit || c.usedCount < c.usageLimit) && (usedMap.get(String(c._id)) || 0) < (c.perCustomerLimit || 1)) });
});
