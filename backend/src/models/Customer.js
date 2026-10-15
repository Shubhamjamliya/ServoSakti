const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true }, // login id
  email: String,
  passwordHash: { type: String, required: true, select: false },
  active: { type: Boolean, default: true },
  addresses: [{ label: String, line: String, city: String, lat: Number, lng: Number }],
}, { timestamps: true });

module.exports = mongoose.model('Customer', schema);
