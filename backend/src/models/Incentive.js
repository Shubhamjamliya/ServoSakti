const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  engineerId: { ...{ type: Schema.Types.ObjectId, ref: 'Engineer' }, index: true }, month: String, approvedCalls: { type: Number, default: 0 },
  rechargeEligible: Boolean, rechargeDays: { type: Number, default: 28 }, rechargeIssuedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Incentive', schema);
