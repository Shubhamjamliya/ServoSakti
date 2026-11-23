const mongoose = require('mongoose');
const { Schema } = mongoose;
const { JOB_TYPES, COVERAGE, SLOTS } = require('../constants');
const ref = (r) => ({ type: Schema.Types.ObjectId, ref: r });

const schema = new Schema({
  srNumber: { type: String, unique: true },
  customerId: ref('Customer'), customerName: String, customerPhone: String,
  passportId: ref('ProductPassport'), oemId: { ...ref('Oem'), index: true }, vendorId: { ...ref('Vendor'), index: true },
  engineerId: { ...ref('Engineer'), index: true }, outsourcedBy: { ...ref('Vendor'), index: true }, complaintId: ref('AiComplaint'), repeatOf: ref('ServiceRequest'),
  brand: String, model: String, serialNumber: String,
  city: String, address: String, location: { lat: Number, lng: Number }, zoneId: { ...ref('Zone'), index: true }, zoneName: String,
  jobType: { type: String, enum: JOB_TYPES, default: 'breakdown' },
  warranty: { type: String, enum: ['warranty', 'non_warranty'], default: 'non_warranty' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
  issue: String,
  origin: { type: String, enum: ['own', 'platform', 'outsourced', 'partner'], default: 'platform' },
  status: {
    type: String,
    enum: ['pending_payment', 'created', 'verified', 'offered', 'unassigned', 'assigned', 'in_progress', 'under_review', 'approved', 'closed', 'cancelled', 'failed'],
    default: 'created', index: true,
  },
  dispatch: { queue: [{ kind: String, id: Schema.Types.ObjectId, priority: Number }], index: { type: Number, default: 0 }, outsourced: Boolean },
  otp: { code: String, expiresAt: Date, verified: { type: Boolean, default: false } },
  tatDueAt: Date, slaAlertedAt: Date, slaBreached: { type: Boolean, default: false },
  completedAt: Date, approvedAt: Date, closedAt: Date,
  reviewNote: String, failReason: String, rating: Number, feedback: String,

  /* ---- customer pricing (services/pricing.service.js) ---- */
  subtypeId: ref('Subtype'), subtypeName: String,
  coverage: { type: String, enum: COVERAGE, default: 'none' }, // decided on the booking date and kept for the whole job
  subscriptionId: ref('PlanSubscription'),
  slot: { type: String, enum: SLOTS, default: 'scheduled' },
  scheduledAt: Date, reschedules: { type: Number, default: 0 },
  addOnIds: [ref('AddOn')],
  // parts fitted on site, with the list price at the moment they were added
  parts: [{ partId: ref('Part'), name: String, code: String, unit: String, qty: { type: Number, default: 1 }, price: Number, coveredBy: [String], partWarranty: Boolean, _id: false }],
  repair: { type: Boolean, default: false }, // breakdown: diagnosed, repair labour replaces the visit charge
  damage: { type: Boolean, default: false }, // physical damage found on site: coverage no longer applies to this job
  paymentMode: { type: String, enum: ['prepaid', 'postpaid'], default: 'postpaid' },
  // { lines: [{ code, kind, label, qty, unitPrice, listAmount, amount, covered, note }], subtotal, discount, taxable, gst, total, paid, refunded, due, upfront }
  bill: Schema.Types.Mixed,
  priceSnapshot: Schema.Types.Mixed, // every rate and setting used, frozen at booking so later price changes never touch it
  paymentStatus: { type: String, enum: ['not_required', 'pending', 'partial', 'paid'], default: 'not_required' },
  cashCollected: { type: Number, default: 0 },
  // on-site product check by the engineer
  verification: { nameplatePhoto: String, serialNumber: String, damageNote: String, damagePhotos: [String], at: Date },
  // revised quote waiting for the customer: { status, reason, changes, state, bill, oldTotal, newTotal, createdAt, expiresAt, respondedAt }
  quote: Schema.Types.Mixed,
  flags: [String], // reasons the job needs admin review before payout
  cancellation: { by: String, at: Date, fee: Number, reason: String },
  oemClaim: { status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' }, amount: Number, decidedAt: Date, note: String },
}, { timestamps: true });

module.exports = mongoose.model('ServiceRequest', schema);
