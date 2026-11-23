const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true }, // login id
  email: String,
  avatar: String,
  passwordHash: { type: String, required: true, select: false },
  active: { type: Boolean, default: true },
  fcmTokens: [{ type: String, select: false }],
  addresses: [{
    label: String, line: String, landmark: String, city: String, state: String, pincode: String, lat: Number, lng: Number,
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' }, zoneName: String, isDefault: { type: Boolean, default: false },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Customer', schema);
