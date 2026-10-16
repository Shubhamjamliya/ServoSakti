const mongoose = require('mongoose');
const { Schema } = mongoose;

// History of admin broadcasts (the per-recipient copies live in Notification).
const schema = new Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  audience: { type: String, enum: ['all', 'admin', 'oem', 'vendor_owner', 'engineer', 'customer'], default: 'all' },
  recipients: Number,
  createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

module.exports = mongoose.model('Broadcast', schema);
