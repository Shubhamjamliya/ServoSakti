const crypto = require('crypto');
const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const WalletTxn = require('../models/WalletTxn');
const Withdrawal = require('../models/Withdrawal');
const CashDeposit = require('../models/CashDeposit');
const Setting = require('../models/Setting');
const { Engineer, Vendor, Customer } = require('../models/accounts');
const { ApiError, asyncHandler, paginate } = require('../utils/helpers');
const wallets = require('../services/wallet.service');
const { notify, notifyAdmins, audit } = require('../services/realtime');

const { toPaise, toRupees } = wallets;
const MODEL = { engineer: Engineer, vendor: Vendor, customer: Customer };
const nameOf = (doc) => doc?.legalName || doc?.name || '—';

/** The wallet that belongs to the caller. */
function ownerOf(req) {
  if (req.user.role === 'engineer') return { ownerType: 'engineer', ownerId: req.engineer._id };
  if (req.user.role === 'vendor_owner') return { ownerType: 'vendor', ownerId: new mongoose.Types.ObjectId(req.user.companyId) };
  if (req.user.role === 'customer') return { ownerType: 'customer', ownerId: req.customer._id };
  throw new ApiError(403, 'No wallet for this account');
}

async function ownerDoc(ownerType, ownerId) {
  return MODEL[ownerType].findById(ownerId).lean();
}

/** Adds owner names to wallet / withdrawal / deposit rows (admin lists). */
async function withNames(rows) {
  const byType = {};
  rows.forEach((r) => { (byType[r.ownerType] ||= new Set()).add(String(r.ownerId)); });
  const names = new Map();
  for (const [type, ids] of Object.entries(byType)) {
    const docs = await MODEL[type].find({ _id: { $in: [...ids] } }).select('name legalName phone companyId').lean();
    docs.forEach((d) => names.set(`${type}:${d._id}`, { name: nameOf(d), phone: d.phone }));
  }
  return rows.map((r) => ({ ...r, ownerName: names.get(`${r.ownerType}:${r.ownerId}`)?.name, ownerPhone: names.get(`${r.ownerType}:${r.ownerId}`)?.phone }));
}

/* ---- my wallet ---- */
exports.me = asyncHandler(async (req, res) => {
  const o = ownerOf(req);
  const [w, settings, open, doc] = await Promise.all([
    wallets.summary(o.ownerType, o.ownerId),
    Setting.get(),
    o.ownerType === 'customer' ? null : Withdrawal.findOne({ ownerType: o.ownerType, ownerId: o.ownerId, status: 'requested' }).lean(),
    o.ownerType === 'customer' ? null : ownerDoc(o.ownerType, o.ownerId),
  ]);
  res.json({ ...w, minWithdrawal: settings.pricing?.minWithdrawal ?? 500, openWithdrawal: open && { ...open, amount: toRupees(open.amount) }, bank: doc?.bank || null, independent: o.ownerType === 'engineer' ? !req.engineer.companyId : undefined });
});

exports.txns = asyncHandler(async (req, res) => {
  let filter;
  if (req.user.role === 'admin') {
    filter = {};
    if (req.query.ownerType) filter.ownerType = req.query.ownerType;
    if (req.query.ownerId) filter.ownerId = new mongoose.Types.ObjectId(String(req.query.ownerId));
  } else filter = ownerOf(req);
  const data = await paginate(WalletTxn, filter, req, { search: ['srNumber', 'note'], filters: ['kind', 'direction'] });
  data.items = data.items.map(wallets.shapeTxn);
  if (req.user.role === 'admin') data.items = await withNames(data.items);
  res.json(data);
});

/** Admin: every wallet of a type with balances and cash held. */
exports.list = asyncHandler(async (req, res) => {
  const filter = { ownerType: req.query.ownerType || 'engineer' };
  if (req.query.cashHeld === '1') filter.cashHeld = { $gt: 0 };
  const data = await paginate(Wallet, filter, req, { sort: { balance: -1 } });
  data.items = await withNames(data.items.map((w) => ({ ...w, balance: toRupees(w.balance), cashHeld: toRupees(w.cashHeld) })));
  res.json(data);
});

/* ---- bank details (engineer, service company) ---- */
exports.setBank = asyncHandler(async (req, res) => {
  const o = ownerOf(req);
  if (o.ownerType === 'customer') throw new ApiError(403, 'Not available');
  const b = Object.fromEntries(['accountName', 'accountNumber', 'ifsc', 'bankName', 'upi'].map((k) => [k, String(req.body[k] || '').trim()]));
  b.ifsc = b.ifsc.toUpperCase();
  const hasAccount = b.accountName && b.accountNumber && b.ifsc;
  if (!hasAccount && !b.upi) throw new ApiError(400, 'Add a bank account (name, number, IFSC) or a UPI ID');
  if (b.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(b.ifsc)) throw new ApiError(400, 'Enter a valid IFSC code (e.g. HDFC0001234)');
  if (b.accountNumber && !/^\d{9,18}$/.test(b.accountNumber)) throw new ApiError(400, 'Enter a valid account number (9–18 digits)');
  if (b.upi && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(b.upi)) throw new ApiError(400, 'Enter a valid UPI ID (e.g. name@okhdfc)');
  await MODEL[o.ownerType].updateOne({ _id: o.ownerId }, { bank: b });
  audit(req.user, 'wallet.bank', o.ownerType, o.ownerId);
  res.json({ bank: b });
});

/* ---- withdrawals ---- */
exports.requestWithdrawal = asyncHandler(async (req, res) => {
  const o = ownerOf(req);
  if (o.ownerType === 'customer') throw new ApiError(403, 'Customers cannot withdraw. The wallet balance is used for bookings.');
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  const settings = await Setting.get();
  const min = settings.pricing?.minWithdrawal ?? 500;
  if (!(amount >= min)) throw new ApiError(400, `The minimum withdrawal is ₹${min}`);
  const doc = await ownerDoc(o.ownerType, o.ownerId);
  if (!doc?.bank?.accountNumber && !doc?.bank?.upi) throw new ApiError(400, 'Add your bank account or UPI ID first');
  if (await Withdrawal.exists({ ...o, status: 'requested' })) throw new ApiError(409, 'You already have a withdrawal waiting. Wait for it to be paid.');
  const w = await wallets.inTransaction(async (session) => {
    const [wd] = await Withdrawal.create([{ ...o, ownerName: nameOf(doc), ownerPhone: doc.phone, amount: toPaise(amount), bank: doc.bank }], { session }).catch((e) => {
      if (e.code === 11000) throw new ApiError(409, 'You already have a withdrawal waiting. Wait for it to be paid.');
      throw e;
    });
    // the money leaves the balance now, so it can't be withdrawn twice
    await wallets.post([{ ...o, direction: 'debit', amount, requireFunds: true, kind: 'withdrawal', key: `wd:${wd._id}`, refType: 'Withdrawal', refId: wd._id, note: 'Withdrawal requested', by: req.user.id, byRole: req.user.role }], { session });
    return wd;
  });
  await notifyAdmins('Withdrawal request', `${nameOf(doc)} asked to withdraw ₹${amount}`, 'withdrawal');
  audit(req.user, 'withdrawal.request', 'Withdrawal', w._id, { amount });
  res.status(201).json({ ...w.toObject(), amount });
});

exports.listWithdrawals = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : ownerOf(req);
  const data = await paginate(Withdrawal, filter, req, { search: ['ownerName', 'ownerPhone', 'reference'], filters: ['status', 'ownerType'] });
  data.items = data.items.map((w) => ({ ...w, amount: toRupees(w.amount) }));
  res.json(data);
});

/** Admin: paid (with the bank / UPI reference) or rejected (money goes back to the wallet). */
exports.decideWithdrawal = asyncHandler(async (req, res) => {
  const { action, reference, note } = req.body;
  if (action === 'paid') {
    if (!String(reference || '').trim()) throw new ApiError(400, 'Enter the UTR / UPI reference of the transfer');
    const wd = await Withdrawal.findOneAndUpdate({ _id: req.params.id, status: 'requested' }, { status: 'paid', reference: String(reference).trim(), note, decidedBy: req.user.id, decidedAt: new Date() }, { new: true });
    if (!wd) throw new ApiError(409, 'This withdrawal is not waiting any more');
    audit(req.user, 'withdrawal.paid', 'Withdrawal', wd._id, { reference });
    await notify([wd.ownerId], 'Withdrawal paid', `₹${toRupees(wd.amount)} sent to your bank / UPI. Reference ${wd.reference}`, 'withdrawal');
    return res.json({ ...wd.toObject(), amount: toRupees(wd.amount) });
  }
  if (action !== 'reject') throw new ApiError(400, 'action must be paid or reject');
  if (!String(note || '').trim()) throw new ApiError(400, 'Add a reason for rejecting');
  const wd = await wallets.inTransaction(async (session) => {
    const d = await Withdrawal.findOneAndUpdate({ _id: req.params.id, status: 'requested' }, { status: 'rejected', note, decidedBy: req.user.id, decidedAt: new Date() }, { new: true, session });
    if (!d) throw new ApiError(409, 'This withdrawal is not waiting any more');
    await wallets.post([{ ownerType: d.ownerType, ownerId: d.ownerId, direction: 'credit', amount: toRupees(d.amount), kind: 'withdrawal_reversal', key: `wd:${d._id}:reversal`, refType: 'Withdrawal', refId: d._id, note: `Withdrawal rejected: ${note}`, by: req.user.id, byRole: req.user.role }], { session });
    return d;
  });
  audit(req.user, 'withdrawal.reject', 'Withdrawal', wd._id, { note });
  await notify([wd.ownerId], 'Withdrawal not approved', `₹${toRupees(wd.amount)} is back in your wallet. ${note}`, 'withdrawal');
  res.json({ ...wd.toObject(), amount: toRupees(wd.amount) });
});

/* ---- customer cash: engineer → service company → platform ---- */

/** Service company / admin: who is holding customer cash right now. */
exports.cashHolders = asyncHandler(async (req, res) => {
  let rows;
  if (req.user.role === 'vendor_owner') {
    const engineers = await Engineer.find({ companyId: req.user.companyId }).select('_id').lean();
    rows = await Wallet.find({ $or: [{ ownerType: 'engineer', ownerId: { $in: engineers.map((e) => e._id) } }, { ownerType: 'vendor', ownerId: req.user.companyId }], cashHeld: { $gt: 0 } }).lean();
  } else {
    rows = await Wallet.find({ ownerType: { $in: ['engineer', 'vendor'] }, cashHeld: { $gt: 0 } }).sort({ cashHeld: -1 }).lean();
  }
  const items = await withNames(rows.map((w) => ({ ...w, id: w._id, balance: toRupees(w.balance), cashHeld: toRupees(w.cashHeld) })));
  // engineers of a service company hand cash to the company; independent engineers deposit to the platform
  const engIds = items.filter((r) => r.ownerType === 'engineer').map((r) => r.ownerId);
  const engs = await Engineer.find({ _id: { $in: engIds } }).select('companyId engineerType').lean();
  const engMap = new Map(engs.map((e) => [String(e._id), e]));
  res.json({ items: items.map((r) => ({ ...r, companyId: engMap.get(String(r.ownerId))?.companyId, independent: engMap.get(String(r.ownerId))?.engineerType === 'independent' })), total: items.length });
});

/** Service company received all the cash one of its engineers holds. Moves it from the engineer to the company. */
exports.handover = asyncHandler(async (req, res) => {
  const eng = await Engineer.findOne({ _id: req.body.engineerId, companyId: req.user.companyId }).lean();
  if (!eng) throw new ApiError(404, 'Engineer not found in your company');
  const amount = await wallets.inTransaction(async (session) => {
    const ew = await wallets.walletOf('engineer', eng._id, session);
    if (ew.cashHeld <= 0) throw new ApiError(409, `${eng.name} is not holding any cash`);
    const last = await WalletTxn.findOne({ walletId: ew._id }).sort({ createdAt: -1 }).session(session).lean();
    const rupees = toRupees(ew.cashHeld);
    const key = `handover:${ew._id}:${last?._id || 'start'}`; // a double submit hits the same key and is refused
    const common = { kind: 'cash_handover', refType: 'Engineer', refId: eng._id, by: req.user.id, byRole: req.user.role };
    await wallets.post([
      { ...common, ownerType: 'engineer', ownerId: eng._id, direction: 'credit', amount: rupees, cashDelta: -rupees, key: `${key}:engineer`, note: 'Cash handed to the service company' },
      { ...common, ownerType: 'vendor', ownerId: new mongoose.Types.ObjectId(req.user.companyId), direction: 'debit', amount: rupees, cashDelta: rupees, key: `${key}:vendor`, note: `Cash received from ${eng.name}` },
    ], { session });
    return rupees;
  });
  audit(req.user, 'cash.handover', 'Engineer', eng._id, { amount });
  await notify([eng._id], 'Cash handed over', `Your service company confirmed receiving ₹${amount} cash from you`, 'wallet');
  res.json({ amount });
});

/** Service company (or independent engineer) reports paying the cash it holds to the platform. Admin confirms. */
exports.submitDeposit = asyncHandler(async (req, res) => {
  const o = ownerOf(req);
  if (o.ownerType === 'customer') throw new ApiError(403, 'Not available');
  if (o.ownerType === 'engineer' && req.engineer.companyId) throw new ApiError(403, 'Hand your cash to your service company; they deposit it');
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  const w = await wallets.summary(o.ownerType, o.ownerId);
  if (!(amount > 0)) throw new ApiError(400, 'Enter the amount you paid');
  const pending = await CashDeposit.aggregate([{ $match: { ...o, status: 'submitted' } }, { $group: { _id: null, a: { $sum: '$amount' } } }]);
  const open = toRupees(pending[0]?.a || 0);
  if (amount > w.cashHeld - open + 0.009) throw new ApiError(400, `You hold ₹${w.cashHeld}${open ? ` (₹${open} already waiting for confirmation)` : ''}`);
  if (!String(req.body.reference || '').trim()) throw new ApiError(400, 'Enter the payment reference (UTR / UPI ref)');
  const doc = await ownerDoc(o.ownerType, o.ownerId);
  const dep = await CashDeposit.create({ ...o, ownerName: nameOf(doc), amount: toPaise(amount), method: req.body.method || 'bank', reference: String(req.body.reference).trim(), proofUrl: req.body.proofUrl, note: req.body.note });
  await notifyAdmins('Cash deposit to confirm', `${nameOf(doc)} paid ₹${amount} (${dep.reference})`, 'wallet');
  res.status(201).json({ ...dep.toObject(), amount });
});

exports.listDeposits = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : ownerOf(req);
  const data = await paginate(CashDeposit, filter, req, { search: ['ownerName', 'reference'], filters: ['status', 'ownerType'] });
  data.items = data.items.map((d) => ({ ...d, amount: toRupees(d.amount) }));
  res.json(data);
});

async function confirmDeposit(dep, user, session) {
  const amount = toRupees(dep.amount);
  await wallets.post([{
    ownerType: dep.ownerType, ownerId: dep.ownerId, direction: 'credit', amount, cashDelta: -amount, kind: 'cash_deposit',
    key: `deposit:${dep._id}`, refType: 'CashDeposit', refId: dep._id, note: `Cash deposited (${dep.reference || dep.method})`, by: user.id, byRole: user.role,
  }], { session });
}

/** Admin confirms (cash cleared, wallet credited) or rejects a reported deposit. */
exports.decideDeposit = asyncHandler(async (req, res) => {
  const { decision, note } = req.body;
  if (!['confirm', 'reject'].includes(decision)) throw new ApiError(400, 'decision must be confirm or reject');
  const dep = await wallets.inTransaction(async (session) => {
    const d = await CashDeposit.findOneAndUpdate({ _id: req.params.id, status: 'submitted' }, { status: decision === 'confirm' ? 'confirmed' : 'rejected', decisionNote: note, decidedBy: req.user.id, decidedAt: new Date() }, { new: true, session });
    if (!d) throw new ApiError(409, 'This deposit is not waiting any more');
    if (decision === 'confirm') await confirmDeposit(d, req.user, session);
    return d;
  });
  audit(req.user, `cash.deposit.${decision}`, 'CashDeposit', dep._id, { note });
  await notify([dep.ownerId], decision === 'confirm' ? 'Cash deposit confirmed' : 'Cash deposit not confirmed', decision === 'confirm' ? `₹${toRupees(dep.amount)} received. Thank you.` : `₹${toRupees(dep.amount)} (${dep.reference}): ${note || 'contact support'}`, 'wallet');
  res.json({ ...dep.toObject(), amount: toRupees(dep.amount) });
});

/** Admin received cash directly (counter deposit) from an engineer or service company: recorded and confirmed at once. */
exports.receiveCash = asyncHandler(async (req, res) => {
  const { ownerType, ownerId, reference } = req.body;
  if (!['engineer', 'vendor'].includes(ownerType)) throw new ApiError(400, 'ownerType must be engineer or vendor');
  const w = await wallets.summary(ownerType, ownerId);
  const amount = req.body.amount != null ? Math.round(Number(req.body.amount) * 100) / 100 : w.cashHeld;
  if (!(amount > 0) || amount > w.cashHeld + 0.009) throw new ApiError(400, `They hold ₹${w.cashHeld}`);
  const doc = await ownerDoc(ownerType, ownerId);
  const dep = await wallets.inTransaction(async (session) => {
    const [d] = await CashDeposit.create([{ ownerType, ownerId, ownerName: nameOf(doc), amount: toPaise(amount), method: 'cash', reference: reference || 'Received at office', status: 'confirmed', decidedBy: req.user.id, decidedAt: new Date() }], { session });
    await confirmDeposit(d, req.user, session);
    return d;
  });
  audit(req.user, 'cash.receive', 'CashDeposit', dep._id, { amount });
  await notify([ownerId], 'Cash received', `₹${amount} cash received by the office`, 'wallet');
  res.json({ ...dep.toObject(), amount });
});

/** Admin correction (credit or debit) with a reason. `requestId` from the form makes a double submit harmless. */
exports.adjust = asyncHandler(async (req, res) => {
  const { ownerType, ownerId, direction, note } = req.body;
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  if (!['customer', 'engineer', 'vendor'].includes(ownerType) || !ownerId) throw new ApiError(400, 'Choose whose wallet');
  if (!['credit', 'debit'].includes(direction)) throw new ApiError(400, 'direction must be credit or debit');
  if (!(amount > 0)) throw new ApiError(400, 'Enter an amount');
  if (!String(note || '').trim()) throw new ApiError(400, 'A reason is required');
  if (!(await MODEL[ownerType].exists({ _id: ownerId }))) throw new ApiError(404, 'Account not found');
  const key = `adjust:${req.body.requestId || crypto.randomUUID()}`;
  const { posted } = await wallets.post([{ ownerType, ownerId, direction, amount, kind: 'adjustment', key, note, by: req.user.id, byRole: req.user.role, requireFunds: ownerType === 'customer' && direction === 'debit' }]);
  audit(req.user, 'wallet.adjust', ownerType, ownerId, { direction, amount, note });
  if (posted.length) await notify([ownerId], 'Wallet updated', `₹${amount} ${direction === 'credit' ? 'added to' : 'deducted from'} your wallet: ${note}`, 'wallet');
  res.json({ ok: true, duplicate: !posted.length });
});
