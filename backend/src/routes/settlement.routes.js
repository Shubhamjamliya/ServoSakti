const router = require('express').Router();
const ctrl = require('../controllers/settlement.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/payouts', allow('admin', 'oem', 'vendor_owner', 'engineer'), ctrl.payouts);
router.post('/payouts/approve-all', allow('admin'), ctrl.approveAll);
router.patch('/payouts/:id', allow('admin'), ctrl.actOnPayout);
router.get('/export', allow('admin', 'oem', 'vendor_owner', 'engineer'), ctrl.exportPayouts);
router.get('/summary', allow('admin', 'oem', 'vendor_owner'), ctrl.summary);
router.get('/disputes', allow('admin', 'vendor_owner', 'engineer', 'customer'), ctrl.listDisputes);
router.post('/disputes', allow('vendor_owner', 'engineer'), ctrl.createDispute);
router.patch('/disputes/:id/respond', allow('vendor_owner'), ctrl.respondDispute);
router.patch('/disputes/:id', allow('admin'), ctrl.resolveDispute);
router.get('/warranty-claims', allow('admin', 'oem'), ctrl.warrantyClaims);
router.post('/warranty-claims/settle', allow('admin'), ctrl.settleClaims);
router.patch('/warranty-claims/:srId', allow('admin', 'oem'), ctrl.decideClaim);
router.get('/incentives', allow('admin', 'engineer'), ctrl.incentives);
router.patch('/incentives/:id/issue', allow('admin'), ctrl.issueRecharge);

module.exports = router;
