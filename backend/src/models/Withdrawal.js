const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Engineer / service company withdrawal. The amount is taken from the wallet when requested (so it can't be spent
 * twice), paid manually by the admin (bank / UPI, with the reference) or rejected (money returned to the wallet).
 */
const schema = new Schema({
  ownerType: { type: String, enum: ['engineer', 'vendor'], required: true },
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
  ownerName: String, ownerPhone: String,
  amount: { type: Number, required: true, min: 1 }, // paise
  status: { type: String, enum: ['requested', 'paid', 'rejected'], default: 'requested', index: true },
  bank: { accountName: String, accountNumber: String, ifsc: String, bankName: String, upi: String },
  reference: String, // UTR / UPI ref when paid
  note: String,
  decidedBy: Schema.Types.ObjectId, decidedAt: Date,
}, { timestamps: true });

// at most one open request per wallet, enforced by the database (two taps at once can't both get through)
schema.index({ ownerType: 1, ownerId: 1 }, { unique: true, partialFilterExpression: { status: 'requested' } });

module.exports = mongoose.model('Withdrawal', schema);
