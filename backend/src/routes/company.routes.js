const router = require('express').Router();
const ctrl = require('../controllers/company.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/authorizations', allow('admin', 'oem', 'vendor_owner'), ctrl.listAuthorizations);
router.post('/authorizations', allow('admin', 'oem'), ctrl.createAuthorization);
router.patch('/authorizations/:id', allow('admin', 'oem'), ctrl.updateAuthorization);
router.patch('/me', allow('oem', 'vendor_owner'), ctrl.updateMine);
router.get('/partners', allow('vendor_owner'), ctrl.partners);
router.get('/', allow('admin', 'oem', 'vendor_owner'), ctrl.list);
router.get('/:id', allow('admin', 'oem', 'vendor_owner'), ctrl.get);
router.patch('/:id/status', allow('admin'), ctrl.setStatus);

module.exports = router;
