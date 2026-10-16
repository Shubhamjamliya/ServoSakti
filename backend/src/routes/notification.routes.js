const router = require('express').Router();
const ctrl = require('../controllers/notification.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/', ctrl.list);
router.patch('/read', ctrl.markRead);
router.post('/fcm-token', ctrl.registerToken);
router.delete('/fcm-token', ctrl.unregisterToken);

module.exports = router;
