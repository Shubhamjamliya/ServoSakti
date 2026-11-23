const mongoose = require('mongoose');
const { Schema } = mongoose;
const ref = (r) => ({ type: Schema.Types.ObjectId, ref: r });

// A plan bought for ONE product serial. It follows the product on ownership transfer.
const schema = new Schema({
  planId: ref('Plan'), planSnapshot: Schema.Types.Mixed,
  type: { type: String, enum: ['amc', 'cmc'], required: true },
  passportId: { ...ref('ProductPassport'), index: true }, customerId: { ...ref('Customer'), index: true },
  serialNumber: String, brand: String, model: String,
  price: Number, inspectionCredit: { type: Number, default: 0 },
  startDate: Date, endDate: Date, breakdownFrom: Date,
  pmVisitsTotal: { type: Number, default: 0 }, pmVisitsUsed: { type: Number, default: 0 },
  status: { type: String, enum: ['pending_payment', 'active', 'expired', 'cancelled'], default: 'pending_payment', index: true },
  paymentId: ref('Payment'),
  remindersSent: [String],
  cancelledAt: Date, cancelReason: String, refundAmount: Number,
}, { timestamps: true });

module.exports = mongoose.model('PlanSubscription', schema);
