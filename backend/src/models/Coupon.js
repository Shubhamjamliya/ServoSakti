const mongoose = require('mongoose');
const { Schema } = mongoose;
const { JOB_TYPES } = require('../constants');

/**
 * Discount codes created by the admin. The discount applies to service, visit and add-on charges (never to parts,
 * distance or slot surcharges) after any prepaid discount, before GST.
 */
const schema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  title: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['percent', 'flat'], required: true },
  value: { type: Number, required: true, min: 0 },     // % or ₹
  maxDiscount: { type: Number, min: 0 },               // ₹ cap for percent coupons
  minOrder: { type: Number, default: 0, min: 0 },      // ₹ of eligible charges needed
  validFrom: Date, validTo: Date,
  usageLimit: { type: Number, min: 1 },                // total uses (empty = unlimited)
  perCustomerLimit: { type: Number, default: 1, min: 1 },
  usedCount: { type: Number, default: 0 },
  firstBookingOnly: { type: Boolean, default: false },
  jobTypes: [{ type: String, enum: JOB_TYPES }],       // empty = every service
  subtypeIds: [{ type: Schema.Types.ObjectId, ref: 'Subtype' }], // empty = every product type
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Coupon', schema);
