const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: 'Vendor', index: true }, // empty for independent engineers
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true }, // login id
  email: String,
  passwordHash: { type: String, required: true, select: false },
  engineerType: { type: String, enum: ['company', 'independent'], default: 'company' },
  skills: [String], certifications: [{ brand: String, docUrl: String }],
  city: String, serviceTerritories: [String], serviceZones: [{ type: Schema.Types.ObjectId, ref: 'Zone' }],
  available: { type: Boolean, default: true }, active: { type: Boolean, default: true },
  fcmTokens: [{ type: String, select: false }],
  status: { type: String, enum: ['pending', 'approved', 'suspended', 'rejected'], default: 'pending' },
  statusReason: String,
  kyc: [{ docType: String, url: String }],
  location: { lat: Number, lng: Number, at: Date },
  avatar: String,
  bank: { accountName: String, accountNumber: String, ifsc: String, bankName: String, upi: String }, // for withdrawals
  // Profile edits that change who gets which calls wait here until the service company (or admin, for independent
  // engineers) approves them: { name?, city?, certifications?, requestedAt, note }
  pendingChanges: Schema.Types.Mixed,
}, { timestamps: true });

module.exports = mongoose.model('Engineer', schema);
