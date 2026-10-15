const router = require('express').Router();
const ctrl = require('../controllers/engineer.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/me', allow('engineer'), ctrl.me);
router.patch('/me', allow('engineer'), ctrl.updateMe);
router.get('/', allow('admin', 'vendor_owner'), ctrl.list);
router.post('/', allow('vendor_owner'), ctrl.create);
router.get('/:id/performance', allow('admin', 'vendor_owner'), ctrl.performance);
router.patch('/:id', allow('admin', 'vendor_owner'), ctrl.update);
router.patch('/:id/status', allow('admin'), ctrl.setStatus);

module.exports = router;
