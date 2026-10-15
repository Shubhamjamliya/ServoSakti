const mongoose = require('mongoose');

const schema = new mongoose.Schema({ key: { type: String, unique: true }, seq: { type: Number, default: 0 } });

schema.statics.next = async function next(key) {
  const doc = await this.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return doc.seq;
};

module.exports = mongoose.model('Counter', schema);
