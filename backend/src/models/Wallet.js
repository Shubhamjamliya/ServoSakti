const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * One wallet per customer, engineer and service company. Amounts are integer paise (no floating point).
 *   balance   what the owner can use / withdraw. Engineers and service companies can go negative when the cash they
 *             hold for the platform is more than they have earned.
 *   cashHeld  customer cash collected on site and not yet handed over / deposited (engineers, service companies).
 * Only services/wallet.service.js changes these, always together with a WalletTxn in one transaction.
 */
const schema = new Schema({
  ownerType: { type: String, enum: ['customer', 'engineer', 'vendor'], required: true },
  ownerId: { type: Schema.Types.ObjectId, required: true },
  balance: { type: Number, default: 0 },
  cashHeld: { type: Number, default: 0 },
}, { timestamps: true });

schema.index({ ownerType: 1, ownerId: 1 }, { unique: true });

module.exports = mongoose.model('Wallet', schema);
