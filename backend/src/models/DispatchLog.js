const mongoose = require('mongoose');
const { Schema } = mongoose;
const ref = (r) => ({ type: Schema.Types.ObjectId, ref: r });

const schema = new Schema({
  serviceRequestId: { ...ref('ServiceRequest'), index: true }, srNumber: String,
  candidateEngineerId: ref('Engineer'), candidateCompanyId: ref('Vendor'), candidateName: String,
  priority: { type: Number, enum: [0, 1, 2, 3, 4] }, // 0 = manual assignment / override
  offeredAt: Date, expiresAt: Date, respondedAt: Date,
  outcome: { type: String, enum: ['pending', 'accepted', 'rejected', 'timeout', 'assigned', 'override'], default: 'pending' },
  reason: String, actorId: Schema.Types.ObjectId,
}, { timestamps: true });

module.exports = mongoose.model('DispatchLog', schema);
