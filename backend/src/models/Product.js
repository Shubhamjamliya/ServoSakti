const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  oemId: { type: Schema.Types.ObjectId, ref: 'Oem', index: true }, brand: String, model: String, category: String, warrantyMonths: Number,
  subtypeId: { type: Schema.Types.ObjectId, ref: 'Subtype' }, // a model knows its subtype, so customers never pick a capacity by hand
}, { timestamps: true });

module.exports = mongoose.model('Product', schema);
