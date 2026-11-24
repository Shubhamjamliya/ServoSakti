const router = require('express').Router();
const ctrl = require('../controllers/coupon.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/available', allow('customer'), ctrl.available);
router.get('/', allow('admin'), ctrl.list);
router.post('/', allow('admin'), ctrl.create);
router.patch('/:id', allow('admin'), ctrl.update);
router.get('/:id/redemptions', allow('admin'), ctrl.redemptions);

module.exports = router;
