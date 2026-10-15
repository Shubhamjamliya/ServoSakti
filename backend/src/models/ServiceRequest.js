const mongoose = require('mongoose');
const { Schema } = mongoose;
const ref = (r) => ({ type: Schema.Types.ObjectId, ref: r });

const schema = new Schema({
  srNumber: { type: String, unique: true },
  customerId: ref('Customer'), customerName: String, customerPhone: String,
  passportId: ref('ProductPassport'), oemId: { ...ref('Oem'), index: true }, vendorId: { ...ref('Vendor'), index: true },
  engineerId: { ...ref('Engineer'), index: true }, outsourcedBy: { ...ref('Vendor'), index: true }, complaintId: ref('AiComplaint'), repeatOf: ref('ServiceRequest'),
  brand: String, model: String, serialNumber: String,
  city: String, address: String, location: { lat: Number, lng: Number },
  jobType: { type: String, enum: ['pm', 'breakdown', 'installation', 'other'], default: 'breakdown' },
  warranty: { type: String, enum: ['warranty', 'non_warranty'], default: 'non_warranty' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
  issue: String,
  origin: { type: String, enum: ['own', 'platform', 'outsourced', 'partner'], default: 'platform' },
  status: {
    type: String,
    enum: ['created', 'verified', 'offered', 'unassigned', 'assigned', 'in_progress', 'under_review', 'approved', 'closed', 'cancelled'],
    default: 'created', index: true,
  },
  dispatch: { queue: [{ kind: String, id: Schema.Types.ObjectId, priority: Number }], index: { type: Number, default: 0 }, outsourced: Boolean },
  otp: { code: String, expiresAt: Date, verified: { type: Boolean, default: false } },
  tatDueAt: Date, slaAlertedAt: Date, slaBreached: { type: Boolean, default: false },
  completedAt: Date, approvedAt: Date, closedAt: Date,
  reviewNote: String, rating: Number, feedback: String,
}, { timestamps: true });

module.exports = mongoose.model('ServiceRequest', schema);
