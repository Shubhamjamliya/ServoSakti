const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const { ApiError } = require('../utils/helpers');

const { money } = require('../utils/helpers');

/** What pricing needs to recompute a coupon discount later (frozen on the booking). */
const snapshotOf = (c) => ({ couponId: c._id, code: c.code, type: c.type, value: c.value, maxDiscount: c.maxDiscount, minOrder: c.minOrder || 0 });

/**
 * Coupon discount on the eligible charges (service + visit + add-ons) left after any prepaid discount.
 * Returns 0 when the eligible charges are below the coupon's minimum order.
 */
function couponDiscount(coupon, eligibleBase, afterPrepaid) {
  if (!coupon || eligibleBase <= 0 || eligibleBase < (coupon.minOrder || 0)) return 0;
  let d = coupon.type === 'percent' ? (afterPrepaid * coupon.value) / 100 : coupon.value;
  if (coupon.type === 'percent' && coupon.maxDiscount) d = Math.min(d, coupon.maxDiscount);
  return money(Math.max(0, Math.min(d, afterPrepaid)));
}

/**
 * Checks a code for a booking and returns the coupon. Throws a customer-readable message when it can't be used.
 *   ctx: { customerId, jobType, subtypeId, firstBooking, at }
 */
async function validate(code, { customerId, jobType, subtypeId, firstBooking, at = new Date() } = {}, session) {
  const c = await Coupon.findOne({ code: String(code || '').trim().toUpperCase() }).session(session || null);
  if (!c || !c.active) throw new ApiError(400, 'This coupon code is not valid');
  if (c.validFrom && at < c.validFrom) throw new ApiError(400, 'This coupon is not active yet');
  if (c.validTo && at > c.validTo) throw new ApiError(400, 'This coupon has expired');
  if (c.usageLimit && c.usedCount >= c.usageLimit) throw new ApiError(400, 'This coupon has been fully used');
  if (c.firstBookingOnly && !firstBooking) throw new ApiError(400, 'This coupon is only for your first booking');
  if (c.jobTypes?.length && !c.jobTypes.includes(jobType)) throw new ApiError(400, 'This coupon does not apply to this service');
  if (c.subtypeIds?.length && !c.subtypeIds.some((s) => String(s) === String(subtypeId))) throw new ApiError(400, 'This coupon does not apply to this product');
  if (customerId) {
    const used = await CouponRedemption.countDocuments({ couponId: c._id, customerId, status: 'applied' }).session(session || null);
    if (used >= (c.perCustomerLimit || 1)) throw new ApiError(400, 'You have already used this coupon');
  }
  return c;
}

/** Records the use on a booking. The usage counter only moves if a use is still left (no overselling under load). */
async function redeem(coupon, sr, discount, session) {
  const filter = { _id: coupon._id, active: true, ...(coupon.usageLimit ? { usedCount: { $lt: coupon.usageLimit } } : {}) };
  const ok = await Coupon.updateOne(filter, { $inc: { usedCount: 1 } }, { session });
  if (!ok.modifiedCount) throw new ApiError(409, 'This coupon has just been fully used');
  await CouponRedemption.create([{ couponId: coupon._id, code: coupon.code, customerId: sr.customerId, serviceRequestId: sr._id, srNumber: sr.srNumber, discount }], { session });
}

/** Booking cancelled before the visit / never paid: the use goes back to the coupon. Safe to call twice. */
async function release(serviceRequestId, session) {
  const r = await CouponRedemption.findOneAndUpdate({ serviceRequestId, status: 'applied' }, { status: 'released' }, { new: true, session });
  if (r) await Coupon.updateOne({ _id: r.couponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
  return !!r;
}

module.exports = { snapshotOf, couponDiscount, validate, redeem, release };
