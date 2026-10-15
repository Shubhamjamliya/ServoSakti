const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true }, passportId: { type: Schema.Types.ObjectId, ref: 'ProductPassport' },
  brand: String, model: String,
  inputMode: { type: String, enum: ['text', 'voice'], default: 'text' }, transcript: String, summary: String,
  customerConfirmed: { type: Boolean, default: false },
  call: {
    status: { type: String, enum: ['not_started', 'queued', 'registered', 'failed', 'human_handoff'], default: 'not_started' },
    srNumber: String, expectedTat: String, notes: String, recordingUrl: String, consent: Boolean, failureReason: String, retries: { type: Number, default: 0 },
  },
  followUpAt: Date, followUpCount: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'confirmed', 'registered', 'failed', 'escalated', 'closed'], default: 'draft' },
}, { timestamps: true });

module.exports = mongoose.model('AiComplaint', schema);
