const mongoose = require('mongoose');

// Admins log in with email + password.
const schema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: String,
  passwordHash: { type: String, required: true, select: false },
  active: { type: Boolean, default: true },
  fcmTokens: [{ type: String, select: false }],
}, { timestamps: true });

module.exports = mongoose.model('Admin', schema);
