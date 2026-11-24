const RefundRequest = require('../models/RefundRequest');
const { asyncHandler, paginate } = require('../utils/helpers');
const refunds = require('../services/refund.service');

exports.list = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'customer' ? { customerId: req.customer._id } : {};
  if (req.query.serviceRequestId) filter.serviceRequestId = req.query.serviceRequestId;
  const data = await paginate(RefundRequest, filter, req, { search: ['srNumber', 'reason'], filters: ['status', 'destination'], populate: { path: 'customerId', select: 'name phone' } });
  data.items = await Promise.all(data.items.map(async (r) => ({
    ...r, customerName: r.customerId?.name, customerPhone: r.customerId?.phone, customerId: r.customerId?._id || r.customerId,
    // what can go back to the card / UPI; the rest of a refund can only go to the wallet
    sourceRefundable: r.status === 'awaiting_customer' ? await refunds.sourceRefundable(r) : undefined,
  })));
  res.json(data);
});

/** Customer: wallet or original payment. */
exports.choose = asyncHandler(async (req, res) => res.json(await refunds.choose(req.params.id, req.customer, req.body.destination)));

/** Admin: approve (money moves) or reject. */
exports.decide = asyncHandler(async (req, res) => res.json(await refunds.decide(req.params.id, req.user, req.body.decision, req.body.note)));
