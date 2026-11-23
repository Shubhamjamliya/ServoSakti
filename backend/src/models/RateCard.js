const mongoose = require('mongoose');
const { Schema } = mongoose;
const { JOB_TYPES } = require('../constants');

const schema = new Schema({
  oemId: { type: Schema.Types.ObjectId, ref: 'Oem', required: true, index: true },
  brand: { type: String, required: true },
  subtypeId: { type: Schema.Types.ObjectId, ref: 'Subtype' }, // optional: a subtype-specific card wins over the brand-wide one
  jobType: { type: String, enum: JOB_TYPES, required: true },
  // payout for jobs done under that coverage (AMC/CMC fall back to the non-warranty card when they have none)
  warranty: { type: String, enum: ['warranty', 'non_warranty', 'amc', 'cmc'], required: true },
  // travel allowance added on top of the base payouts, by distance
  distanceSlabs: [{ fromKm: Number, toKm: Number, amount: Number }],
  vendorPayout: { type: Number, default: 0 }, engineerPayout: { type: Number, default: 0 },
  independentEngineerPayout: Number, // optional separate rate for independent (non-company) engineers
  platformFee: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('RateCard', schema);
