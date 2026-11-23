const mongoose = require('mongoose');
const { Schema } = mongoose;
const ref = (r) => ({ type: Schema.Types.ObjectId, ref: r });

const schema = new Schema({
  customerId: { ...ref('Customer'), index: true },
  customerName: String, customerPhone: { type: String, index: true },
  productId: ref('Product'),
  warrantyNo: String, brand: String, model: String, serialNumber: { type: String, index: true }, invoiceUrl: String,
  purchaseDate: Date, warrantyStart: Date, warrantyEnd: Date, images: [String], remindersSent: [Number],
  category: String, subtypeId: ref('Subtype'), subtypeName: String,
  // app = bought through Aftenza · oem_registered = added by OEM/admin · self_added = customer added it · transferred = changed owner
  source: { type: String, enum: ['app', 'oem_registered', 'self_added', 'transferred'], default: 'self_added' },
  // set once an engineer has checked the nameplate on site; unverified products must prepay the visit charge
  verified: { type: Boolean, default: false }, verifiedBy: ref('Engineer'), verifiedAt: Date,
  // OEM warranty only counts once approved. Missing (older records) counts as approved.
  warrantyVerification: { type: String, enum: ['none', 'pending', 'approved', 'rejected'] },
  warrantyNote: String,
  inspectedAt: Date, inspectionFee: Number, // last pre-inspection that found the product working (needed before buying a plan)
  blocked: { type: Boolean, default: false }, blockReason: String, // stolen / fraud: bookings refused
  ownerHistory: [{ customerId: ref('Customer'), name: String, phone: String, from: Date, to: Date }],
  transfer: {
    status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    requestedBy: ref('Customer'), requestedName: String, requestedPhone: String, requestedAt: Date,
    proofUrl: String, decidedBy: Schema.Types.ObjectId, decidedRole: String, decidedAt: Date, note: String,
  },
}, { timestamps: true });

module.exports = mongoose.model('ProductPassport', schema);
