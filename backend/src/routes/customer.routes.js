const router = require('express').Router();
const ctrl = require('../controllers/customer.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/me', allow('customer'), ctrl.me);
router.patch('/me', allow('customer'), ctrl.updateMe);
router.delete('/me', allow('customer'), ctrl.deleteMe);
router.post('/me/addresses', allow('customer'), ctrl.addAddress);
router.patch('/me/addresses/:addressId', allow('customer'), ctrl.updateAddress);
router.delete('/me/addresses/:addressId', allow('customer'), ctrl.removeAddress);
router.get('/', allow('admin'), ctrl.list);

module.exports = router;
