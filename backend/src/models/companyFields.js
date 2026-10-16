// Fields shared by the `oems` and `vendors` collections. Each company document is also the owner's login account.
module.exports = {
  legalName: { type: String, required: true },
  ownerName: String,
  phone: { type: String, required: true, unique: true }, // owner login id
  email: String,
  passwordHash: { type: String, required: true, select: false },
  address: String, city: String, gstin: String,
  kyc: [{ docType: String, url: String, verified: { type: Boolean, default: false } }],
  authorizedBrands: [String], // OEM: its own brands; vendor: brands it is certified for
  status: { type: String, enum: ['pending', 'approved', 'suspended', 'rejected'], default: 'pending' },
  statusReason: String,
  active: { type: Boolean, default: true },
  fcmTokens: [{ type: String, select: false }],
};
