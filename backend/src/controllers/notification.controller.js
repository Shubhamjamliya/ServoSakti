const Notification = require('../models/Notification');
const { asyncHandler, ApiError } = require('../utils/helpers');
const push = require('../services/push.service');

exports.list = asyncHandler(async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50).lean(),
    Notification.countDocuments({ userId: req.user.id, read: false }),
  ]);
  res.json({ items, unread });
});

exports.markRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
  res.json({ ok: true });
});

// Any authenticated role registers its own device/browser token; one endpoint serves the web panels and both mobile apps.
exports.registerToken = asyncHandler(async (req, res) => {
  if (!req.body.token) throw new ApiError(400, 'token is required');
  await push.registerToken(req.user.role, req.user.id, req.body.token);
  res.json({ ok: true });
});

exports.unregisterToken = asyncHandler(async (req, res) => {
  if (!req.body.token) throw new ApiError(400, 'token is required');
  await push.unregisterToken(req.user.role, req.user.id, req.body.token);
  res.json({ ok: true });
});
