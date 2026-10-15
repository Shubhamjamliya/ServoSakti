const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  payoutId: { type: Schema.Types.ObjectId, ref: 'Payout' }, raisedBy: { type: Schema.Types.ObjectId, ref: 'User' }, reason: String,
  status: { type: String, enum: ['open', 'approved', 'rejected'], default: 'open' }, outcome: String,
}, { timestamps: true });

module.exports = mongoose.model('Dispute', schema);
