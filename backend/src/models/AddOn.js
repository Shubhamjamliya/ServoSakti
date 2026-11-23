const mongoose = require('mongoose');
const { Schema } = mongoose;
const { JOB_TYPES } = require('../constants');

// Optional extras the customer picks at booking (never free under any coverage).
const schema = new Schema({
  name: { type: String, required: true, trim: true },
  description: String,
  price: { type: Number, required: true, min: 0 },
  subtypeIds: [{ type: Schema.Types.ObjectId, ref: 'Subtype' }], // empty = every subtype
  jobTypes: [{ type: String, enum: JOB_TYPES }], // empty = every job type
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('AddOn', schema);
