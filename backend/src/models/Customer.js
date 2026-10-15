const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' }, name: String, phone: String,
  addresses: [{ label: String, line: String, city: String, lat: Number, lng: Number }],
}, { timestamps: true });

module.exports = mongoose.model('Customer', schema);
