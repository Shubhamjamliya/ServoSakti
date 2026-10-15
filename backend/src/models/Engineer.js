const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' }, companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
  engineerType: { type: String, enum: ['company', 'independent'], default: 'company' },
  skills: [String], certifications: [{ brand: String, docUrl: String }], city: String, serviceTerritories: [String],
  available: { type: Boolean, default: true }, active: { type: Boolean, default: true },
  kyc: [{ docType: String, url: String }], location: { lat: Number, lng: Number, at: Date },
}, { timestamps: true });

module.exports = mongoose.model('Engineer', schema);
