const mongoose = require('mongoose');
const { Schema } = mongoose;

// A service zone is a polygon drawn on the map by the Servoshakti admin. Customer addresses, service requests,
// engineers and service companies are matched to zones to decide who can serve where.
const schema = new Schema({
  name: { type: String, required: true, trim: true, index: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, default: 'India', trim: true },
  coordinates: {
    type: [{ latitude: { type: Number, required: true }, longitude: { type: Number, required: true }, _id: false }],
    validate: { validator: (v) => Array.isArray(v) && v.length >= 3, message: 'A zone needs at least 3 points' },
  },
  maxRadiusKm: Number, // optional per-zone override of the global dispatch radius
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

module.exports = mongoose.model('Zone', schema);
