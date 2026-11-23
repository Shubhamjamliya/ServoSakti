const mongoose = require('mongoose');
const { Schema } = mongoose;

// Parts and site extras an engineer can add. Engineers pick from this list; they never type a price.
const schema = new Schema({
  name: { type: String, required: true, trim: true },
  code: String,
  unit: { type: String, enum: ['piece', 'ft', 'kg', 'set'], default: 'piece' },
  price: { type: Number, required: true, min: 0 },
  coveredBy: [{ type: String, enum: ['warranty', 'cmc'] }], // empty = always charged (consumables, damage, materials)
  partWarrantyDays: { type: Number, default: 90 }, // a replaced part that fails again inside this window is free
  subtypeIds: [{ type: Schema.Types.ObjectId, ref: 'Subtype' }], // empty = every subtype
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Part', schema);
