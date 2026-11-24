const router = require('express').Router();
const ctrl = require('../controllers/refund.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/', allow('admin', 'customer'), ctrl.list);
router.patch('/:id/choose', allow('customer'), ctrl.choose);
router.patch('/:id/decide', allow('admin'), ctrl.decide);

module.exports = router;
