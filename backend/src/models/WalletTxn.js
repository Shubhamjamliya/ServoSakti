const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Immutable wallet ledger. Every change to a Wallet writes exactly one of these in the same transaction.
 * `key` is unique: the same business event (e.g. "payout X credited to engineer") can never be posted twice,
 * which makes every money operation safe to retry (idempotent).
 */
const KINDS = [
  'job_earning',          // payout approved: engineer / service company share
  'cash_collected',       // engineer took customer cash on site (platform's money in hand)
  'cash_handover',        // engineer handed that cash to their service company
  'cash_deposit',         // service company / independent engineer paid the cash to the platform
  'withdrawal',           // withdrawal requested (held from the balance)
  'withdrawal_reversal',  // withdrawal rejected (money back)
  'refund',               // customer refund to wallet
  'wallet_payment',       // customer paid a bill from the wallet
  'adjustment',           // manual correction by the admin
];

const schema = new Schema({
  walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
  ownerType: { type: String, required: true },
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
  direction: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true, min: 1 }, // paise
  balanceAfter: { type: Number, required: true },
  cashDelta: { type: Number, default: 0 }, // change to cashHeld, paise
  cashHeldAfter: { type: Number, default: 0 },
  kind: { type: String, enum: KINDS, required: true },
  refType: String, refId: Schema.Types.ObjectId, srNumber: String,
  note: String,
  by: Schema.Types.ObjectId, byRole: String,
  key: { type: String, required: true, unique: true },
}, { timestamps: true });

schema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTxn', schema);
module.exports.KINDS = KINDS;
