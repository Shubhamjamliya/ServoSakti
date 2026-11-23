const mongoose = require('mongoose');
const companyFields = require('./companyFields');

const schema = new mongoose.Schema({
  ...companyFields,
  warrantyTransferable: { type: Boolean, default: true }, // does OEM warranty move to the new owner on ownership transfer
}, { timestamps: true });

module.exports = mongoose.model('Oem', schema);
