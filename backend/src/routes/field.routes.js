const router = require('express').Router();
const ctrl = require('../controllers/field.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.post('/day-start', allow('engineer'), ctrl.dayStart);
router.get('/day', allow('engineer'), ctrl.day);
router.post('/:srId/check-in', allow('engineer'), ctrl.checkIn);
router.patch('/:srId/report', allow('engineer'), ctrl.saveReport);
router.post('/:srId/verify-product', allow('engineer'), ctrl.verifyProduct);
router.put('/:srId/parts', allow('engineer'), ctrl.setParts);
router.post('/:srId/collect-cash', allow('engineer'), ctrl.collectCash);
router.post('/:srId/no-show', allow('engineer'), ctrl.noShow);
router.post('/:srId/otp', allow('engineer'), ctrl.sendOtp);
router.post('/:srId/otp/verify', allow('engineer'), ctrl.verifyOtp);
router.post('/:srId/submit', allow('engineer'), ctrl.submit);
router.get('/:srId/report', ctrl.report);
router.patch('/:srId/review', allow('admin', 'oem', 'vendor_owner'), ctrl.review);
router.patch('/:srId/fail', allow('admin', 'oem', 'vendor_owner'), ctrl.fail);

module.exports = router;
