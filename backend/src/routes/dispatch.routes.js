const router = require('express').Router();
const ctrl = require('../controllers/dispatch.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/logs', allow('admin', 'oem', 'vendor_owner'), ctrl.logs);
router.get('/offers', allow('engineer', 'vendor_owner'), ctrl.myOffers);
router.post('/offers/:logId/accept', allow('engineer', 'vendor_owner'), ctrl.accept);
router.post('/offers/:logId/reject', allow('engineer', 'vendor_owner'), ctrl.reject);
router.post('/:srId/start', allow('admin', 'oem'), ctrl.start);
router.post('/:srId/assign', allow('admin', 'vendor_owner'), ctrl.assign);
router.post('/:srId/outsource', allow('vendor_owner'), ctrl.outsource);

module.exports = router;
