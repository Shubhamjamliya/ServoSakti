const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  serviceRequestId: { type: Schema.Types.ObjectId, ref: 'ServiceRequest', unique: true }, engineerId: { type: Schema.Types.ObjectId, ref: 'Engineer' },
  crmRef: String,
  checkIn: { lat: Number, lng: Number, at: Date, distanceKm: Number },
  serialNumber: String, readings: Schema.Types.Mixed, workDone: String, remarks: String,
  beforePhotos: [String], afterPhotos: [String],
  customerSignature: String, efsrUrl: String, submittedAt: Date,
  review: { by: Schema.Types.ObjectId, status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }, note: String, at: Date },
}, { timestamps: true });

module.exports = mongoose.model('FieldReport', schema);
