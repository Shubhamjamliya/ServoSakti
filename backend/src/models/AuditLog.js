const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  actorId: Schema.Types.ObjectId, actorRole: String, action: String, entity: String, entityId: Schema.Types.ObjectId, meta: Schema.Types.Mixed,
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', schema);
