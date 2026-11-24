const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const WalletTxn = require('../models/WalletTxn');
const { ApiError } = require('../utils/helpers');

/**
 * The only place wallet balances change. Every change:
 *   - runs inside a MongoDB transaction (all entries of one business event commit together, or none do)
 *   - writes one immutable WalletTxn per wallet touched
 *   - carries a unique `key` per business event, so posting the same event twice is a no-op (idempotent)
 * Amounts are passed in rupees and stored in integer paise.
 */

const { toPaise } = require('../utils/helpers');
const toRupees = (paise) => Math.round(paise) / 100;

/** Runs `fn(session)` in a transaction, reusing the caller's session when there is one. */
async function inTransaction(fn, session) {
  if (session) return fn(session);
  const s = await mongoose.startSession();
  try {
    let result;
    await s.withTransaction(async () => { result = await fn(s); });
    return result;
  } finally {
    await s.endSession();
  }
}

async function walletOf(ownerType, ownerId, session) {
  return Wallet.findOneAndUpdate(
    { ownerType, ownerId },
    { $setOnInsert: { ownerType, ownerId, balance: 0, cashHeld: 0 } },
    { upsert: true, new: true, session },
  );
}

/**
 * Posts one or more ledger entries atomically.
 *   entry: { ownerType, ownerId, direction: 'credit'|'debit', amount (₹), kind, key, cashDelta (₹, optional),
 *            requireFunds (debit only: refuse if the balance would go below 0), refType, refId, srNumber, note, by, byRole }
 * Returns { posted: [WalletTxn], skipped: [key] } — entries whose key already exists are skipped, not repeated.
 */
async function post(entries, { session } = {}) {
  return inTransaction(async (s) => {
    const posted = [];
    const skipped = [];
    for (const e of entries) {
      const amount = toPaise(e.amount);
      const cashDelta = toPaise(e.cashDelta || 0);
      if (amount <= 0) continue;
      if (await WalletTxn.exists({ key: e.key }).session(s)) { skipped.push(e.key); continue; }
      const wallet = await walletOf(e.ownerType, e.ownerId, s);
      const signed = e.direction === 'credit' ? amount : -amount;
      const guard = e.direction === 'debit' && e.requireFunds ? { balance: { $gte: amount } } : {};
      if (cashDelta < 0) guard.cashHeld = { $gte: -cashDelta };
      const updated = await Wallet.findOneAndUpdate({ _id: wallet._id, ...guard }, { $inc: { balance: signed, cashHeld: cashDelta } }, { new: true, session: s });
      if (!updated) {
        if (cashDelta < 0 && wallet.cashHeld < -cashDelta) throw new ApiError(409, `Only ₹${toRupees(wallet.cashHeld)} cash is held`);
        throw new ApiError(409, `Insufficient wallet balance (₹${toRupees(wallet.balance)} available)`);
      }
      const [txn] = await WalletTxn.create([{
        walletId: wallet._id, ownerType: e.ownerType, ownerId: e.ownerId, direction: e.direction, amount, balanceAfter: updated.balance,
        cashDelta, cashHeldAfter: updated.cashHeld, kind: e.kind, key: e.key,
        refType: e.refType, refId: e.refId, srNumber: e.srNumber, note: e.note, by: e.by, byRole: e.byRole,
      }], { session: s });
      posted.push(txn);
    }
    return { posted, skipped };
  }, session);
}

/** Wallet in rupees, created on first use. */
async function summary(ownerType, ownerId) {
  const w = await walletOf(ownerType, ownerId);
  return { _id: w._id, ownerType, ownerId, balance: toRupees(w.balance), cashHeld: toRupees(w.cashHeld), withdrawable: Math.max(0, toRupees(w.balance)) };
}

/** Rupees-shaped ledger row for the API. */
const shapeTxn = (t) => ({ ...t, amount: toRupees(t.amount), balanceAfter: toRupees(t.balanceAfter), cashDelta: toRupees(t.cashDelta || 0), cashHeldAfter: toRupees(t.cashHeldAfter || 0) });

/** Cash held per owner (₹), for dispatch limits and lists. */
async function cashHeldMap(ownerType, ownerIds) {
  const rows = await Wallet.find({ ownerType, ownerId: { $in: ownerIds } }).select('ownerId cashHeld').lean();
  return new Map(rows.map((w) => [String(w.ownerId), toRupees(w.cashHeld)]));
}

module.exports = { toPaise, toRupees, inTransaction, walletOf, post, summary, shapeTxn, cashHeldMap };
