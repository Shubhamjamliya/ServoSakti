const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  oemId: { type: Schema.Types.ObjectId, ref: 'Oem', required: true, index: true },
  brand: { type: String, required: true },
  jobType: { type: String, enum: ['pm', 'breakdown', 'installation', 'other'], required: true },
  warranty: { type: String, enum: ['warranty', 'non_warranty'], required: true },
  // travel allowance added on top of the base payouts, by distance
  distanceSlabs: [{ fromKm: Number, toKm: Number, amount: Number }],
  vendorPayout: { type: Number, default: 0 }, engineerPayout: { type: Number, default: 0 }, platformFee: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('RateCard', schema);
