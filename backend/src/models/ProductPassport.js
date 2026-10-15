const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  customerId: { ...{ type: Schema.Types.ObjectId, ref: 'Customer' }, required: true }, productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  brand: String, model: String, serialNumber: String, invoiceUrl: String,
  purchaseDate: Date, warrantyStart: Date, warrantyEnd: Date, images: [String],
}, { timestamps: true });

module.exports = mongoose.model('ProductPassport', schema);
