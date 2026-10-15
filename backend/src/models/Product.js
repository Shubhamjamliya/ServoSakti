const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  oemId: { type: Schema.Types.ObjectId, ref: 'Oem', index: true }, brand: String, model: String, category: String, warrantyMonths: Number,
}, { timestamps: true });

module.exports = mongoose.model('Product', schema);
