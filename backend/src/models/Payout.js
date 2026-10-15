const mongoose = require('mongoose');
const { Schema } = mongoose;
const ref = (r) => ({ type: Schema.Types.ObjectId, ref: r });

const schema = new Schema({
  serviceRequestId: { ...ref('ServiceRequest'), index: true }, srNumber: String,
  oemId: { ...ref('Oem'), index: true }, vendorId: { ...ref('Vendor'), index: true }, engineerId: { ...ref('Engineer'), index: true },
  engineerType: String, brand: String, jobType: String, warranty: String, distanceKm: Number,
  rateCardId: ref('RateCard'), rateMissing: { type: Boolean, default: false },
  rateSnapshot: Schema.Types.Mixed, // frozen copy of the rate card at approval time
  vendorAmount: { type: Number, default: 0 }, engineerAmount: { type: Number, default: 0 }, platformFee: { type: Number, default: 0 }, tax: { type: Number, default: 0 },
  approval: { type: String, enum: ['pending', 'approved', 'held'], default: 'pending' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
  txnRef: String, holdReason: String,
  history: [{ status: String, at: Date, by: Schema.Types.ObjectId, note: String }],
}, { timestamps: true });

module.exports = mongoose.model('Payout', schema);
