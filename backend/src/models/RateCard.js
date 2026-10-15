const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  oemId: { ...{ type: Schema.Types.ObjectId, ref: 'Company' }, required: true }, brand: String, jobType: String, warranty: String,
  distanceSlabs: [{ fromKm: Number, toKm: Number, amount: Number }],
  vendorPayout: Number, engineerPayout: Number, platformFee: Number, active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('RateCard', schema);
