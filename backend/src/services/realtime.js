const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const Admin = require('../models/Admin');

let io = null;
exports.setIo = (instance) => { io = instance; };

/**
 * Persist a notification for each recipient account id and push it to their socket room.
 * Account ids are ObjectIds from the admins/oems/vendors/engineers/customers collections.
 */
exports.notify = async (accountIds, title, body, type = 'info') => {
  const ids = [...new Set((accountIds || []).filter(Boolean).map(String))];
  if (!ids.length) return;
  const docs = await Notification.insertMany(ids.map((userId) => ({ userId, title, body, type })));
  docs.forEach((d) => io?.to(`user:${d.userId}`).emit('notification', d));
};

exports.notifyAdmins = async (title, body, type) => {
  const admins = await Admin.find({ active: true }).select('_id').lean();
  return exports.notify(admins.map((a) => a._id), title, body, type);
};

/** An OEM or vendor company is itself the login account, so it is notified directly. */
exports.notifyCompany = (companyId, title, body, type) => (companyId ? exports.notify([companyId], title, body, type) : undefined);

exports.audit = (actor, action, entity, entityId, meta) => {
  const { id, role } = typeof actor === 'object' && actor ? actor : { id: actor };
  return AuditLog.create({ actorId: id || undefined, actorRole: role, action, entity, entityId, meta }).catch((e) => console.error('audit failed', e.message));
};
