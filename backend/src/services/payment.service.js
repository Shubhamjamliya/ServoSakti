const crypto = require('crypto');
const Payment = require('../models/Payment');
const ServiceRequest = require('../models/ServiceRequest');
const Setting = require('../models/Setting');
const { ApiError } = require('../utils/helpers');
const { withPayments, money } = require('./pricing.service');
const { notify, notifyAdmins } = require('./realtime');

/**
 * Razorpay (Orders API + Checkout). With RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET set, real orders are created and every
 * payment is verified by signature (checkout callback) or by webhook. Without keys, outside production, a "mock" provider
 * lets the whole flow be tested end to end without charging anyone.
 */
const keys = () => ({ id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET });
const live = () => !!(keys().id && keys().secret);
const paise = (rupees) => Math.round(money(rupees) * 100);

async function razorpay(path, body) {
  const { id, secret } = keys();
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(502, `Razorpay: ${data.error?.description || res.statusText}`);
  return data;
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');

/** Creates a Payment and its Razorpay order. Returns what the browser needs to open Checkout. */
async function createOrder({ customer, purpose, amount, serviceRequestId, subscriptionId, description }) {
  if (!(amount > 0)) throw new ApiError(400, 'Nothing to pay');
  if (!live() && process.env.NODE_ENV === 'production') throw new ApiError(503, 'Online payments are not configured yet');
  const payment = await Payment.create({ customerId: customer?._id, purpose, amount: money(amount), serviceRequestId, subscriptionId, provider: live() ? 'razorpay' : 'mock' });
  if (live()) {
    const order = await razorpay('/orders', { amount: paise(amount), currency: 'INR', receipt: String(payment._id), notes: { purpose, serviceRequestId: String(serviceRequestId || ''), subscriptionId: String(subscriptionId || '') } });
    payment.orderId = order.id;
  } else {
    payment.orderId = `mock_order_${payment._id}`;
  }
  await payment.save();
  return checkoutFor(payment, customer, description);
}

async function checkoutFor(payment, customer, description) {
  const { businessSetup } = await Setting.get();
  return {
    paymentId: payment._id, orderId: payment.orderId, amount: paise(payment.amount), currency: 'INR', mock: payment.provider === 'mock',
    keyId: payment.provider === 'razorpay' ? keys().id : undefined,
    name: businessSetup?.companyName || 'Aftenza', description: description || payment.purpose,
    prefill: { name: customer?.name, contact: customer?.phone, email: customer?.email },
  };
}

/** Marks a payment paid (idempotent) and runs what that payment unlocks. */
async function markPaid(payment, razorpayPaymentId) {
  if (payment.status === 'paid') return payment;
  payment.status = 'paid';
  payment.paidAt = new Date();
  if (razorpayPaymentId) payment.paymentId = razorpayPaymentId;
  await payment.save();
  await onPaid(payment);
  return payment;
}

async function onPaid(payment) {
  if (payment.purpose === 'plan') return require('./plan.service').activate(payment.subscriptionId, payment);
  if (!payment.serviceRequestId) return null;
  const sr = await ServiceRequest.findById(payment.serviceRequestId);
  if (!sr) return null;
  await syncBill(sr);
  if (sr.status === 'pending_payment') await require('./booking.service').confirmBooking(sr);
  else await sr.save();
  if (sr.engineerId) await notify([sr.engineerId], 'Payment received', `${sr.srNumber}: ₹${payment.amount} paid online`, 'payment');
  return sr;
}

/** Checkout success callback from the browser: the signature proves the payment came from Razorpay. */
async function verifyCheckout({ paymentId, razorpay_order_id: orderId, razorpay_payment_id: rzpPaymentId, razorpay_signature: signature }, customer) {
  const payment = await Payment.findOne({ _id: paymentId, ...(customer && { customerId: customer._id }) });
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status === 'paid') return payment;
  if (payment.status === 'expired') throw new ApiError(409, 'This payment window has expired. Please book again.');
  if (payment.provider === 'razorpay') {
    if (orderId !== payment.orderId || !safeEqual(hmac(keys().secret, `${orderId}|${rzpPaymentId}`), signature)) throw new ApiError(400, 'Payment could not be verified');
  } else if (payment.provider !== 'mock') throw new ApiError(400, 'Not an online payment');
  return markPaid(payment, rzpPaymentId || `mock_pay_${payment._id}`);
}

/** Razorpay webhook (payment.captured / order.paid / refund.processed). Needs the raw request body for the signature. */
async function handleWebhook(rawBody, signature) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret || !safeEqual(hmac(secret, rawBody), signature)) throw new ApiError(400, 'Invalid webhook signature');
  const event = JSON.parse(rawBody);
  const entity = event.payload?.payment?.entity;
  if (['payment.captured', 'order.paid'].includes(event.event) && entity?.order_id) {
    const payment = await Payment.findOne({ orderId: entity.order_id });
    if (payment && payment.status !== 'paid') await markPaid(payment, entity.id);
  }
  if (event.event === 'payment.failed' && entity?.order_id) {
    await Payment.updateOne({ orderId: entity.order_id, status: 'created' }, { status: 'failed' });
  }
  const refund = event.payload?.refund?.entity;
  if (event.event === 'refund.processed' && refund?.id) {
    await Payment.updateOne({ 'refunds.refundId': refund.id }, { $set: { 'refunds.$.status': 'processed' } });
  }
  return { ok: true };
}

/** Refunds up to `amount` from one payment. Cash is never auto-refunded. */
async function refundPayment(payment, amount, reason) {
  const room = money(payment.amount - (payment.refundedAmount || 0));
  const value = money(Math.min(amount, room));
  if (value <= 0 || payment.provider === 'cash') return 0;
  let refundId = `mock_refund_${payment._id}_${(payment.refunds || []).length + 1}`;
  let status = 'processed';
  if (payment.provider === 'razorpay') {
    const r = await razorpay(`/payments/${payment.paymentId}/refund`, { amount: paise(value), notes: { reason } });
    refundId = r.id;
    status = r.status || 'pending';
  }
  payment.refunds.push({ refundId, amount: value, reason, status, at: new Date() });
  payment.refundedAmount = money((payment.refundedAmount || 0) + value);
  await payment.save();
  return value;
}

/** Refunds `amount` across the job's online payments, newest first. Anything left (cash) is flagged to the admin. */
async function refundServiceRequest(sr, amount, reason) {
  let left = money(amount);
  if (left <= 0) return 0;
  const payments = await Payment.find({ serviceRequestId: sr._id, status: 'paid', provider: { $in: ['razorpay', 'mock'] } }).sort({ paidAt: -1 });
  for (const p of payments) {
    if (left <= 0) break;
    left = money(left - (await refundPayment(p, left, reason)));
  }
  const done = money(amount - left);
  if (done > 0 && sr.customerId) await notify([sr.customerId], 'Refund initiated', `₹${done} for ${sr.srNumber} (${reason}). It reaches your account in 5–7 working days.`, 'payment');
  if (left > 0) await notifyAdmins('Manual refund needed', `${sr.srNumber}: refund ₹${left} to the customer (paid in cash). Reason: ${reason}`, 'payment');
  return done;
}

/** Recomputes paid / refunded / due on the job from its Payment records (the single source of truth). */
async function syncBill(sr) {
  if (!sr.bill) return sr;
  const payments = await Payment.find({ serviceRequestId: sr._id, status: 'paid' }).lean();
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const refunded = payments.reduce((a, p) => a + (p.refundedAmount || 0), 0);
  sr.bill = withPayments(sr.bill, paid, refunded);
  sr.cashCollected = money(payments.filter((p) => p.provider === 'cash').reduce((a, p) => a + p.amount, 0));
  sr.paymentStatus = sr.bill.total <= 0 ? 'not_required' : sr.bill.due <= 0 ? 'paid' : sr.bill.paid - sr.bill.refunded > 0 ? 'partial' : 'pending';
  sr.markModified('bill');
  return sr;
}

/** After a bill goes down: refund what was paid above the new total, then resync. */
async function settleExcess(sr, reason) {
  await syncBill(sr);
  if (sr.bill?.excess > 0) {
    await refundServiceRequest(sr, sr.bill.excess, reason);
    await syncBill(sr);
  }
  return sr;
}

/** Cash handed to the engineer on site. Must match the amount due. */
async function recordCash(sr, engineer, amount) {
  await syncBill(sr);
  if (!(sr.bill?.due > 0)) throw new ApiError(409, 'Nothing is due on this job');
  if (money(amount) !== sr.bill.due) throw new ApiError(400, `Collect exactly ₹${sr.bill.due}`);
  await Payment.create({ customerId: sr.customerId, purpose: 'bill', serviceRequestId: sr._id, amount: sr.bill.due, provider: 'cash', status: 'paid', paidAt: new Date(), collectedBy: engineer._id });
  await syncBill(sr);
  return sr;
}

/** Cash an engineer holds and has not deposited yet. */
async function cashHeld(engineerIds) {
  const rows = await Payment.aggregate([
    { $match: { provider: 'cash', status: 'paid', depositedAt: null, collectedBy: { $in: engineerIds } } },
    { $group: { _id: '$collectedBy', amount: { $sum: '$amount' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.amount]));
}

module.exports = { live, createOrder, checkoutFor, markPaid, verifyCheckout, handleWebhook, refundPayment, refundServiceRequest, syncBill, settleExcess, recordCash, cashHeld };
