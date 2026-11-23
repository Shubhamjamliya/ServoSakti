const mongoose = require('mongoose');
const { Schema } = mongoose;
const { JOB_TYPES } = require('../constants');

// What the CUSTOMER pays for a service on a subtype. Payouts to vendors/engineers live in RateCard.
const schema = new Schema({
  subtypeId: { type: Schema.Types.ObjectId, ref: 'Subtype', required: true, index: true },
  jobType: { type: String, enum: JOB_TYPES, required: true },
  brand: { type: String, default: '' }, // empty = every brand; a brand-specific card wins over the generic one
  price: { type: Number, required: true, min: 0 }, // service / labour price, before GST
  visitCharge: { type: Number, default: 199, min: 0 }, // inspection fee: charged upfront on breakdowns, on rejections and no-shows
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('PriceCard', schema);
