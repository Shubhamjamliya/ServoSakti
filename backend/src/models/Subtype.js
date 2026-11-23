const mongoose = require('mongoose');
const { Schema } = mongoose;

// Product subtype inside a category, e.g. Air Conditioner → "Split AC 1.5 Ton". Customer prices, plans and parts hang off it.
const schema = new Schema({
  category: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

schema.index({ category: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Subtype', schema);
