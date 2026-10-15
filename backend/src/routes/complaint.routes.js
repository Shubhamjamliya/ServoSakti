const router = require('express').Router();
const ctrl = require('../controllers/complaint.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/', allow('admin', 'customer'), ctrl.list);
router.post('/', allow('customer'), ctrl.create);
router.patch('/:id/confirm', allow('customer'), ctrl.confirm);
router.patch('/:id/call-result', allow('admin'), ctrl.callResult);
router.post('/:id/retry', allow('admin'), ctrl.retry);

module.exports = router;
