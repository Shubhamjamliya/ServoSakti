const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Customer cash paid over to the platform by a service company (for its engineers) or an independent engineer.
 * The admin confirms it once the money arrives; that clears the cash they hold and credits their wallet.
 */
const schema = new Schema({
  ownerType: { type: String, enum: ['engineer', 'vendor'], required: true },
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
  ownerName: String,
  amount: { type: Number, required: true, min: 1 }, // paise
  method: { type: String, enum: ['bank', 'upi', 'cash'], default: 'bank' },
  reference: String, proofUrl: String, note: String,
  status: { type: String, enum: ['submitted', 'confirmed', 'rejected'], default: 'submitted', index: true },
  decidedBy: Schema.Types.ObjectId, decidedAt: Date, decisionNote: String,
}, { timestamps: true });

module.exports = mongoose.model('CashDeposit', schema);
