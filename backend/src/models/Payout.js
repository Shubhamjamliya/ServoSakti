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
  coverage: String, surchargeShare: { type: Number, default: 0 },
  cashCollected: { type: Number, default: 0 }, // collected on site by the engineer; subtracted from what the platform pays out
  netPayable: Number, // payable amount minus cash collected (negative = owed to the platform)
  approval: { type: String, enum: ['pending', 'approved', 'held'], default: 'pending' },
  // credited = added to the engineer / service company wallets (they withdraw from there)
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'credited'], default: 'unpaid' },
  txnRef: String, holdReason: String,
  history: [{ status: String, at: Date, by: Schema.Types.ObjectId, note: String }],
}, { timestamps: true });

module.exports = mongoose.model('Payout', schema);
