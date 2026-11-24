const mongoose = require('mongoose');
const companyFields = require('./companyFields');

const schema = new mongoose.Schema({
  ...companyFields,
  serviceAreas: [String],
  serviceZones: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Zone' }],
  isBackup: { type: Boolean, default: false }, // usable as priority-4 backup/emergency coverage
  bank: { accountName: String, accountNumber: String, ifsc: String, bankName: String, upi: String }, // for withdrawals
}, { timestamps: true });

module.exports = mongoose.model('Vendor', schema);
