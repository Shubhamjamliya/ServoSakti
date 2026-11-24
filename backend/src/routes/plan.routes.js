const router = require('express').Router();
const ctrl = require('../controllers/plan.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/offers', allow('customer'), ctrl.offers);
router.post('/subscribe', allow('customer'), ctrl.subscribe);
router.get('/subscriptions', allow('admin', 'oem', 'customer'), ctrl.subscriptions);
router.post('/subscriptions/:id/cancel', allow('admin', 'customer'), ctrl.cancel);
router.get('/subscriptions/:id/invoice', allow('admin', 'oem', 'customer'), ctrl.invoice);

module.exports = router;
