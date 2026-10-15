const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  name: String, phone: { type: String, unique: true }, email: String, passwordHash: String,
  role: { type: String, enum: ['admin', 'oem', 'vendor_owner', 'engineer', 'customer'], required: true },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company' }, active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('User', schema);
