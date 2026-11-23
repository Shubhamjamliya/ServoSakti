const mongoose = require('mongoose');
const { Schema } = mongoose;

// AMC = labour and visits free, parts charged. CMC = labour, visits and covered parts free.
const schema = new Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['amc', 'cmc'], required: true },
  subtypeId: { type: Schema.Types.ObjectId, ref: 'Subtype', required: true, index: true },
  durationMonths: { type: Number, default: 12, min: 1 },
  price: { type: Number, required: true, min: 0 },
  pmVisits: { type: Number, default: 3, min: 0 },
  waitingDays: { type: Number, default: 15, min: 0 }, // breakdown cover starts after this; PM visits start at once
  gasIncluded: { type: Boolean, default: false },
  seller: { type: String, enum: ['platform', 'oem'], default: 'platform' },
  oemId: { type: Schema.Types.ObjectId, ref: 'Oem', index: true }, // set for OEM-sold plans
  brand: { type: String, default: '' }, // OEM plans apply to that brand only
  transferable: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Plan', schema);
