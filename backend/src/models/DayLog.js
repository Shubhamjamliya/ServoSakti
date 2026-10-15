const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  engineerId: { ...{ type: Schema.Types.ObjectId, ref: 'Engineer' }, index: true }, date: String,
  startedAt: Date, startLocation: { lat: Number, lng: Number }, closedAt: Date, autoClosed: Boolean,
}, { timestamps: true });

module.exports = mongoose.model('DayLog', schema);
