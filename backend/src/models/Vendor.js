const mongoose = require('mongoose');
const companyFields = require('./companyFields');

const schema = new mongoose.Schema({
  ...companyFields,
  serviceAreas: [String],
  isBackup: { type: Boolean, default: false }, // usable as priority-4 backup/emergency coverage
}, { timestamps: true });

module.exports = mongoose.model('Vendor', schema);
