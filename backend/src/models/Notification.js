const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  userId: { ...{ type: Schema.Types.ObjectId, ref: 'User' }, index: true }, title: String, body: String, type: String, read: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Notification', schema);
