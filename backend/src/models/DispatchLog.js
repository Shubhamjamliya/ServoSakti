const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  serviceRequestId: { ...{ type: Schema.Types.ObjectId, ref: 'ServiceRequest' }, index: true },
  candidateEngineerId: { type: Schema.Types.ObjectId, ref: 'Engineer' }, candidateCompanyId: { type: Schema.Types.ObjectId, ref: 'Company' },
  priority: { type: Number, enum: [1, 2, 3, 4] }, offeredAt: Date, expiresAt: Date,
  outcome: { type: String, enum: ['pending', 'accepted', 'rejected', 'timeout', 'override'], default: 'pending' }, reason: String,
}, { timestamps: true });

module.exports = mongoose.model('DispatchLog', schema);
