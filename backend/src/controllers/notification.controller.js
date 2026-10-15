const Notification = require('../models/Notification');
const { asyncHandler } = require('../utils/helpers');

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
