const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  serviceRequestId: { ...{ type: Schema.Types.ObjectId, ref: 'ServiceRequest' }, index: true }, engineerId: { type: Schema.Types.ObjectId, ref: 'Engineer' }, crmRef: String,
  checkIn: { lat: Number, lng: Number, at: Date, distanceKm: Number }, serialNumber: String, readings: Schema.Types.Mixed,
  workDone: String, remarks: String, beforePhotos: [String], afterPhotos: [String],
  customerOtpVerified: Boolean, customerSignature: String, efsrUrl: String, submittedAt: Date,
  review: { by: { type: Schema.Types.ObjectId, ref: 'User' }, status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }, note: String },
}, { timestamps: true });

module.exports = mongoose.model('FieldReport', schema);
