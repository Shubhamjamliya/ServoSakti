const Payment = require('../models/Payment');
const Engineer = require('../models/Engineer');
const { ApiError, asyncHandler, paginate } = require('../utils/helpers');
const payments = require('../services/payment.service');
const { audit } = require('../services/realtime');

/** Razorpay Checkout success callback. */
exports.verify = asyncHandler(async (req, res) => {
  const payment = await payments.verifyCheckout(req.body, req.customer);
  res.json({ ok: true, status: payment.status, purpose: payment.purpose, serviceRequestId: payment.serviceRequestId, subscriptionId: payment.subscriptionId });
});

/** Razorpay webhook. `req.rawBody` is kept by the JSON parser in app.js for signature checks. */
exports.webhook = asyncHandler(async (req, res) => {
  res.json(await payments.handleWebhook(req.rawBody?.toString('utf8') || '', req.headers['x-razorpay-signature']));
});

exports.list = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'customer' ? { customerId: req.customer._id } : {};
  const data = await paginate(Payment, filter, req, {
    search: ['orderId', 'paymentId'], filters: ['status', 'purpose', 'provider', 'serviceRequestId'],
    populate: [{ path: 'serviceRequestId', select: 'srNumber' }, { path: 'collectedBy', select: 'name' }, { path: 'customerId', select: 'name phone' }],
  });
  data.items = data.items.map((p) => ({
    ...p, srNumber: p.serviceRequestId?.srNumber, serviceRequestId: p.serviceRequestId?._id || p.serviceRequestId,
    engineerName: p.collectedBy?.name, customerName: p.customerId?.name, customerPhone: p.customerId?.phone, customerId: p.customerId?._id || p.customerId,
  }));
  res.json(data);
});

/** Cash each engineer holds and has not deposited. */
exports.cashHeld = asyncHandler(async (req, res) => {
  const rows = await Payment.aggregate([
    { $match: { provider: 'cash', status: 'paid', depositedAt: null } },
    { $group: { _id: '$collectedBy', amount: { $sum: '$amount' }, jobs: { $sum: 1 } } },
    { $sort: { amount: -1 } },
  ]);
  const engineers = await Engineer.find({ _id: { $in: rows.map((r) => r._id) } }).select('name phone').lean();
  const byId = new Map(engineers.map((e) => [String(e._id), e]));
  const items = rows.map((r) => ({ engineerId: r._id, engineerName: byId.get(String(r._id))?.name, phone: byId.get(String(r._id))?.phone, amount: r.amount, jobs: r.jobs }));
  res.json({ items, total: items.length });
});

/** Admin confirms an engineer deposited the cash they held. */
exports.depositCash = asyncHandler(async (req, res) => {
  const r = await Payment.updateMany({ provider: 'cash', status: 'paid', depositedAt: null, collectedBy: req.params.engineerId }, { depositedAt: new Date() });
  if (!r.modifiedCount) throw new ApiError(404, 'No cash held by this engineer');
  audit(req.user, 'cash.deposit', 'Engineer', req.params.engineerId, { payments: r.modifiedCount });
  res.json({ ok: true, payments: r.modifiedCount });
});

/** Tells the app whether real Razorpay checkout is available. */
exports.config = asyncHandler(async (req, res) => res.json({ live: payments.live(), keyId: payments.live() ? process.env.RAZORPAY_KEY_ID : undefined }));
