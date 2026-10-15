const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  srNumber: { type: String, unique: true }, customerId: { type: Schema.Types.ObjectId, ref: 'Customer' }, passportId: { type: Schema.Types.ObjectId, ref: 'ProductPassport' },
  oemId: { type: Schema.Types.ObjectId, ref: 'Company' }, vendorId: { type: Schema.Types.ObjectId, ref: 'Company' }, engineerId: { type: Schema.Types.ObjectId, ref: 'Engineer' },
  complaintId: { type: Schema.Types.ObjectId, ref: 'AiComplaint' }, // link to the Phase 1B workflow
  jobType: { type: String, enum: ['pm', 'breakdown', 'installation', 'other'] },
  warranty: { type: String, enum: ['warranty', 'non_warranty'] }, priority: String, issue: String,
  origin: { type: String, enum: ['own', 'platform', 'outsourced', 'partner'], default: 'platform' },
  status: { type: String, default: 'created' }, tatDueAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('ServiceRequest', schema);
