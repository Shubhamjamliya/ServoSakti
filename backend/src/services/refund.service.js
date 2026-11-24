const RefundRequest = require('../models/RefundRequest');
const Payment = require('../models/Payment');
const ServiceRequest = require('../models/ServiceRequest');
const { ApiError } = require('../utils/helpers');
const wallets = require('./wallet.service');
const { notify, notifyAdmins, audit } = require('./realtime');

/**
 * Refunds are never automatic:
 *   1. money owed back creates a RefundRequest (awaiting_customer)
 *   2. the customer chooses wallet or original payment
 *   3. the admin approves → the money moves (preApproved requests, e.g. a dispute the admin decided, skip 3)
 * Executing is idempotent: each payment refund is tagged with the request id and skipped if it already happened.
 */

const { money } = require('../utils/helpers');
const OPEN = ['awaiting_customer', 'pending_approval'];
const ONLINE = ['razorpay', 'mock', 'wallet'];

const paymentsFor = (req) => Payment.find({ status: 'paid', ...(req.serviceRequestId ? { serviceRequestId: req.serviceRequestId } : { subscriptionId: req.subscriptionId }) }).sort({ paidAt: -1 });

/** What can go back to the original payment method (online payments not yet refunded). */
async function sourceRefundable(req) {
  const ps = await paymentsFor(req);
  return money(ps.filter((p) => ONLINE.includes(p.provider)).reduce((a, p) => a + p.amount - (p.refundedAmount || 0), 0));
}

/**
 * Keeps one open request per job in line with what the customer is owed: creates it, updates its amount,
 * or cancels it when nothing is owed any more.
 */
async function syncForServiceRequest(sr, amount, reason, { preApproved = false } = {}) {
  const owed = money(amount);
  const open = await RefundRequest.findOne({ serviceRequestId: sr._id, status: { $in: OPEN } });
  if (owed <= 0) {
    if (open) { open.status = 'cancelled'; open.note = 'Nothing owed any more'; await open.save(); }
    return null;
  }
  if (open) {
    if (open.amount !== owed || reason) { open.amount = owed; open.reason = reason || open.reason; open.preApproved = open.preApproved || preApproved; await open.save(); }
    if (open.preApproved && open.status === 'pending_approval') return execute(open, null);
    return open;
  }
  const req = await RefundRequest.create({ customerId: sr.customerId, serviceRequestId: sr._id, srNumber: sr.srNumber, amount: owed, reason, preApproved });
  if (sr.customerId) await notify([sr.customerId], 'Refund available', `₹${owed} for ${sr.srNumber} (${reason}). Choose wallet or original payment in the app.`, 'refund');
  return req;
}

/** Plan cancellation refund. */
async function forSubscription(sub, amount, reason) {
  if (!(amount > 0)) return null;
  const req = await RefundRequest.create({ customerId: sub.customerId, subscriptionId: sub._id, amount: money(amount), reason });
  await notify([sub.customerId], 'Refund available', `₹${money(amount)} for your ${sub.type.toUpperCase()} (${reason}). Choose wallet or original payment in the app.`, 'refund');
  return req;
}

/** Customer picks where the money goes. Original payment is only possible for what was paid online. */
async function choose(id, customer, destination) {
  if (!['wallet', 'source'].includes(destination)) throw new ApiError(400, 'Choose wallet or original payment');
  const req = await RefundRequest.findOne({ _id: id, customerId: customer._id });
  if (!req) throw new ApiError(404, 'Refund not found');
  if (req.status !== 'awaiting_customer') throw new ApiError(409, `This refund is already ${req.status.replace('_', ' ')}`);
  if (destination === 'source') {
    const room = await sourceRefundable(req);
    if (room < req.amount) throw new ApiError(400, room > 0 ? `Only ₹${room} was paid online. Choose wallet for this refund.` : 'This was paid in cash. Choose wallet for this refund.');
  }
  req.destination = destination;
  req.status = 'pending_approval';
  await req.save();
  if (req.preApproved) return execute(req, null);
  await notifyAdmins('Refund to approve', `${req.srNumber || 'Plan'}: ₹${req.amount} to the customer's ${destination === 'wallet' ? 'wallet' : 'original payment'}`, 'refund');
  return req;
}

/** Admin approves (money moves) or rejects. */
async function decide(id, user, decision, note) {
  const req = await RefundRequest.findById(id);
  if (!req) throw new ApiError(404, 'Refund not found');
  if (decision === 'reject') {
    if (!OPEN.includes(req.status)) throw new ApiError(409, `This refund is already ${req.status}`);
    Object.assign(req, { status: 'rejected', decidedBy: user.id, decidedAt: new Date(), note });
    await req.save();
    audit(user, 'refund.reject', 'RefundRequest', req._id, { note });
    if (req.customerId) await notify([req.customerId], 'Refund not approved', `${req.srNumber || 'Plan'}: ${note || 'contact support for details'}`, 'refund');
    return req;
  }
  if (decision !== 'approve') throw new ApiError(400, 'decision must be approve or reject');
  if (req.status !== 'pending_approval') throw new ApiError(409, req.status === 'awaiting_customer' ? 'The customer has not chosen wallet or original payment yet' : `This refund is already ${req.status}`);
  Object.assign(req, { decidedBy: user.id, decidedAt: new Date(), note });
  return execute(req, user);
}

/** Moves the money. Safe to run again after a failure: parts already refunded are skipped. */
async function execute(reqDoc, user) {
  // claim the request: a second click / retry running at the same time stops here
  const req = await RefundRequest.findOneAndUpdate({ _id: reqDoc._id, status: 'pending_approval', executing: { $ne: true } }, { executing: true, decidedBy: reqDoc.decidedBy, decidedAt: reqDoc.decidedAt, note: reqDoc.note }, { new: true });
  if (!req) throw new ApiError(409, 'This refund is already being processed');
  try {
    return await run(req, user);
  } finally {
    await RefundRequest.updateOne({ _id: req._id }, { executing: false });
  }
}

async function run(req, user) {
  let left = money(req.amount);
  const payments = await paymentsFor(req);
  const tagged = (p) => (p.refunds || []).filter((r) => String(r.refundRequestId) === String(req._id)).reduce((a, r) => a + r.amount, 0);
  left = money(left - payments.reduce((a, p) => a + tagged(p), 0)); // already done in an earlier attempt

  if (req.destination === 'wallet') {
    // one transaction: wallet credit + refund marks on the payments it came from
    await wallets.inTransaction(async (session) => {
      let rest = left;
      for (const p of payments) {
        if (rest <= 0) break;
        const room = money(p.amount - (p.refundedAmount || 0));
        const take = money(Math.min(room, rest));
        if (take <= 0) continue;
        p.refunds.push({ refundId: `wallet_${req._id}_${p._id}`, amount: take, reason: req.reason, status: 'processed', method: 'wallet', refundRequestId: req._id, at: new Date() });
        p.refundedAmount = money((p.refundedAmount || 0) + take);
        await p.save({ session });
        rest = money(rest - take);
      }
      if (rest > 0.009) throw new ApiError(409, `Only ₹${money(left - rest)} can be refunded on this job`);
      await wallets.post([{ ownerType: 'customer', ownerId: req.customerId, direction: 'credit', amount: left, kind: 'refund', key: `refund:${req._id}`, refType: 'RefundRequest', refId: req._id, srNumber: req.srNumber, note: req.reason, by: user?.id, byRole: user?.role }], { session });
    });
  } else {
    const pay = require('./payment.service');
    for (const p of payments.filter((x) => ONLINE.includes(x.provider))) {
      if (left <= 0) break;
      left = money(left - (await pay.refundPayment(p, left, req.reason, { refundRequestId: req._id })));
    }
    if (left > 0.009) throw new ApiError(409, `₹${left} could not go back to the original payment. Reject and ask the customer to choose wallet.`);
  }

  Object.assign(req, { status: 'completed', completedAt: new Date() });
  await req.save();
  if (req.serviceRequestId) {
    const sr = await ServiceRequest.findById(req.serviceRequestId);
    if (sr) { await require('./payment.service').syncBill(sr); await sr.save(); }
  }
  if (req.subscriptionId) await require('../models/PlanSubscription').updateOne({ _id: req.subscriptionId }, { refundAmount: req.amount });
  audit(user || { role: 'system' }, 'refund.complete', 'RefundRequest', req._id, { amount: req.amount, destination: req.destination });
  if (req.customerId) {
    await notify([req.customerId], 'Refund done', req.destination === 'wallet'
      ? `₹${req.amount} added to your wallet${req.srNumber ? ` (${req.srNumber})` : ''}`
      : `₹${req.amount} sent back to your original payment${req.srNumber ? ` (${req.srNumber})` : ''}. It reaches you in 5–7 working days.`, 'refund');
  }
  return req;
}

module.exports = { OPEN, sourceRefundable, syncForServiceRequest, forSubscription, choose, decide, execute };
