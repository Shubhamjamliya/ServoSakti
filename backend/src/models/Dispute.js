const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  kind: { type: String, enum: ['payout', 'service'], default: 'payout' }, // service = raised by a customer about a job
  payoutId: { type: Schema.Types.ObjectId, ref: 'Payout', index: true }, srNumber: String,
  serviceRequestId: { type: Schema.Types.ObjectId, ref: 'ServiceRequest', index: true }, customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  category: String, photos: [String], vendorResponse: String, refundAmount: Number, correctedSubtypeId: { type: Schema.Types.ObjectId, ref: 'Subtype' },
  raisedBy: Schema.Types.ObjectId, raisedByRole: String, raisedByName: String,
  vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' }, engineerId: { type: Schema.Types.ObjectId, ref: 'Engineer' },
  reason: String, status: { type: String, enum: ['open', 'approved', 'rejected'], default: 'open' },
  outcome: String, resolvedBy: Schema.Types.ObjectId,
}, { timestamps: true });

module.exports = mongoose.model('Dispute', schema);
