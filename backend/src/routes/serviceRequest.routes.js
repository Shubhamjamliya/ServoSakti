const router = require('express').Router();
const ctrl = require('../controllers/serviceRequest.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.post('/', allow('admin', 'oem', 'customer'), ctrl.create);
router.get('/', ctrl.list);
router.get('/stats', allow('admin', 'oem', 'vendor_owner'), ctrl.stats);
router.get('/sla', allow('admin', 'oem', 'vendor_owner'), ctrl.sla);
router.get('/:id', ctrl.get);
router.patch('/:id/verify', allow('admin', 'oem'), ctrl.verify);
router.patch('/:id/cancel', allow('admin', 'oem', 'customer'), ctrl.cancel);
router.post('/:id/confirm-closure', allow('customer'), ctrl.confirmClosure);

module.exports = router;
