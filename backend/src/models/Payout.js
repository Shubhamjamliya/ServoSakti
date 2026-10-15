const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  serviceRequestId: { ...{ type: Schema.Types.ObjectId, ref: 'ServiceRequest' }, index: true }, engineerId: { type: Schema.Types.ObjectId, ref: 'Engineer' }, vendorId: { type: Schema.Types.ObjectId, ref: 'Company' },
  rateSnapshot: Schema.Types.Mixed, // frozen copy of the rate card at approval time
  vendorAmount: Number, engineerAmount: Number, platformFee: Number, tax: Number,
  approval: { type: String, default: 'pending' }, paymentStatus: { type: String, default: 'unpaid' },
  txnRef: String, history: [{ status: String, at: Date, note: String }],
}, { timestamps: true });

module.exports = mongoose.model('Payout', schema);
