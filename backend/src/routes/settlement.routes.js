const router = require('express').Router();
const ctrl = require('../controllers/settlement.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/payouts', allow('admin', 'oem', 'vendor_owner', 'engineer'), ctrl.payouts);
router.patch('/payouts/:id', allow('admin'), ctrl.actOnPayout);
router.get('/summary', allow('admin', 'oem', 'vendor_owner'), ctrl.summary);
router.get('/disputes', allow('admin', 'vendor_owner', 'engineer'), ctrl.listDisputes);
router.post('/disputes', allow('vendor_owner', 'engineer'), ctrl.createDispute);
router.patch('/disputes/:id', allow('admin'), ctrl.resolveDispute);
router.get('/incentives', allow('admin', 'engineer'), ctrl.incentives);
router.patch('/incentives/:id/issue', allow('admin'), ctrl.issueRecharge);

module.exports = router;
