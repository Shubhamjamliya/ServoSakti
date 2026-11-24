const router = require('express').Router();
const ctrl = require('../controllers/payment.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.post('/webhook', ctrl.webhook); // Razorpay → signed with PAYMENT_WEBHOOK_SECRET, no login

router.use(protect);
router.get('/config', ctrl.config);
router.post('/verify', allow('customer'), ctrl.verify);
router.get('/', allow('admin', 'customer'), ctrl.list);

module.exports = router;
