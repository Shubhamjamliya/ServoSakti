const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Money owed back to a customer (lower price on site, cancellation, rejected revised price, dispute, plan cancel).
 * Never refunded automatically:
 *   awaiting_customer → customer chooses wallet or original payment → pending_approval → admin approves → completed
 * A refund the admin already decided (dispute) is `preApproved` and completes as soon as the customer chooses.
 */
const schema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  serviceRequestId: { type: Schema.Types.ObjectId, ref: 'ServiceRequest', index: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'PlanSubscription' },
  srNumber: String,
  amount: { type: Number, required: true, min: 0 }, // ₹
  reason: String,
  destination: { type: String, enum: ['wallet', 'source'] },
  status: { type: String, enum: ['awaiting_customer', 'pending_approval', 'completed', 'rejected', 'cancelled'], default: 'awaiting_customer', index: true },
  preApproved: { type: Boolean, default: false },
  executing: { type: Boolean, default: false }, // lock while the money moves (no double execution)
  decidedBy: Schema.Types.ObjectId, decidedAt: Date, note: String,
  completedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('RefundRequest', schema);
