const router = require('express').Router();
const ctrl = require('../controllers/customer.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/me', allow('customer'), ctrl.me);
router.patch('/me', allow('customer'), ctrl.updateMe);
router.get('/', allow('admin'), ctrl.list);

module.exports = router;
