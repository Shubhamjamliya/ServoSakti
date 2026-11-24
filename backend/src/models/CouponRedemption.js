const mongoose = require('mongoose');
const { Schema } = mongoose;

/** One coupon use on one booking. Released (and the use given back) if the booking is cancelled before the visit. */
const schema = new Schema({
  couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
  code: String,
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  serviceRequestId: { type: Schema.Types.ObjectId, ref: 'ServiceRequest', unique: true },
  srNumber: String,
  discount: Number, // ₹ at booking
  status: { type: String, enum: ['applied', 'released'], default: 'applied' },
}, { timestamps: true });

module.exports = mongoose.model('CouponRedemption', schema);
