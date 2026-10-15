const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const sys = require('../controllers/system.controller');
const { upload } = require('../controllers/upload.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/dashboard', allow('admin'), ctrl.dashboard);
router.get('/approvals', allow('admin'), ctrl.approvals);
router.get('/mis', allow('admin'), ctrl.mis);
router.get('/quality', allow('admin'), ctrl.quality);
router.get('/settings', allow('admin'), ctrl.getSettings);
router.put('/settings', allow('admin'), ctrl.updateSettings);
router.get('/business-setup', allow('admin'), sys.getBusinessSetup);
router.put('/business-setup', allow('admin'), upload.fields(sys.LOGO_FIELDS.map((name) => ({ name, maxCount: 1 }))), sys.updateBusinessSetup);
router.get('/developer', allow('admin'), sys.getDeveloper);
router.put('/developer', allow('admin'), sys.updateDeveloper);
router.get('/developer/operational-data', allow('admin'), sys.operationalCounts);
router.post('/developer/clear-operational-data', allow('admin'), sys.clearOperationalData);
router.get('/audit-logs', allow('admin'), ctrl.auditLogs);

module.exports = router;
