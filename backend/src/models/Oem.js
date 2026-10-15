const mongoose = require('mongoose');
const companyFields = require('./companyFields');

const schema = new mongoose.Schema({ ...companyFields }, { timestamps: true });

module.exports = mongoose.model('Oem', schema);
