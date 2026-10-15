const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  payoutId: { type: Schema.Types.ObjectId, ref: 'Payout', index: true }, srNumber: String,
  raisedBy: Schema.Types.ObjectId, raisedByRole: String, raisedByName: String,
  vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' }, engineerId: { type: Schema.Types.ObjectId, ref: 'Engineer' },
  reason: String, status: { type: String, enum: ['open', 'approved', 'rejected'], default: 'open' },
  outcome: String, resolvedBy: Schema.Types.ObjectId,
}, { timestamps: true });

module.exports = mongoose.model('Dispute', schema);
