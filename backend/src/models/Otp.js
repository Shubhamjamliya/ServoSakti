const mongoose = require('mongoose');

// One live code per (role, phone); Mongo drops expired rows itself.
const schema = new mongoose.Schema({
  role: { type: String, required: true },
  phone: { type: String, required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });
schema.index({ role: 1, phone: 1 });

module.exports = mongoose.model('Otp', schema);
