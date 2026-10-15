const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  type: { type: String, enum: ['oem', 'vendor'], required: true },
  legalName: String, address: String, city: String, serviceAreas: [String], gstin: String,
  kyc: [{ docType: String, url: String, verified: Boolean }], authorizedBrands: [String],
  status: { type: String, enum: ['pending', 'approved', 'suspended'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('Company', schema);
