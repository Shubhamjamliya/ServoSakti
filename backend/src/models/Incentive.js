const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  engineerId: { type: Schema.Types.ObjectId, ref: 'Engineer', index: true },
  engineerName: String, month: String, // YYYY-MM
  approvedCalls: { type: Number, default: 0 },
  rechargeEligible: { type: Boolean, default: false }, rechargeDays: { type: Number, default: 28 },
  rechargeIssuedAt: Date, rechargeNote: String,
}, { timestamps: true });
schema.index({ engineerId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Incentive', schema);
