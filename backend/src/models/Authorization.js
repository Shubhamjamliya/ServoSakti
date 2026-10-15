const mongoose = require('mongoose');
const { Schema } = mongoose;

// An OEM authorizing a vendor company to service some of its brands in some cities.
const schema = new Schema({
  oemId: { type: Schema.Types.ObjectId, ref: 'Oem', required: true, index: true },
  vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  brands: [String], cities: [String], backup: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
}, { timestamps: true });
schema.index({ oemId: 1, vendorId: 1 }, { unique: true });

module.exports = mongoose.model('Authorization', schema);
