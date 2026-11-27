const mongoose = require('mongoose');
const { Schema } = mongoose;
const ref = (r) => ({ type: Schema.Types.ObjectId, ref: r });

// Every rupee a customer pays: Razorpay orders, cash collected by engineers, and their refunds.
const schema = new Schema({
  customerId: { ...ref('Customer'), index: true },
  purpose: { type: String, enum: ['booking', 'bill', 'plan', 'cancellation', 'wallet_topup'], required: true },
  serviceRequestId: { ...ref('ServiceRequest'), index: true }, subscriptionId: ref('PlanSubscription'),
  amount: { type: Number, required: true }, // rupees
  currency: { type: String, default: 'INR' },
  provider: { type: String, enum: ['razorpay', 'mock', 'cash', 'wallet'], required: true },
  orderId: { type: String, index: true }, paymentId: String,
  status: { type: String, enum: ['created', 'paid', 'failed', 'expired'], default: 'created', index: true },
  paidAt: Date,
  refundedAmount: { type: Number, default: 0 },
  // method: 'source' = back to the card/UPI (or wallet, for wallet payments), 'wallet' = credited to the customer wallet
  refunds: [{ refundId: String, amount: Number, reason: String, status: String, method: String, refundRequestId: Schema.Types.ObjectId, at: Date }],
  collectedBy: ref('Engineer'), // cash only
  depositedAt: Date, // cash handed over by the engineer
}, { timestamps: true });

module.exports = mongoose.model('Payment', schema);
