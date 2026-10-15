const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer' }, passportId: { type: Schema.Types.ObjectId, ref: 'ProductPassport' },
  inputMode: { type: String, enum: ['text', 'voice'] }, transcript: String, summary: String, customerConfirmed: Boolean,
  call: { status: String, srNumber: String, expectedTat: String, recordingUrl: String, consent: Boolean, failureReason: String, retries: Number },
  followUpAt: Date, status: String,
}, { timestamps: true });

module.exports = mongoose.model('AiComplaint', schema);
