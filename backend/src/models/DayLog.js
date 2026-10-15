const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  engineerId: { type: Schema.Types.ObjectId, ref: 'Engineer', index: true }, date: String, // IST YYYY-MM-DD
  startedAt: Date, startLocation: { lat: Number, lng: Number }, closedAt: Date, autoClosed: Boolean,
}, { timestamps: true });
schema.index({ engineerId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DayLog', schema);
