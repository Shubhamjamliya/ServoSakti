const router = require('express').Router();
const ctrl = require('../controllers/zone.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.get('/public', ctrl.listPublic);
router.get('/detect', ctrl.detect);

router.use(protect);
router.put('/coverage', allow('engineer', 'vendor_owner'), ctrl.setCoverage);
router.get('/', allow('admin'), ctrl.list);
router.post('/', allow('admin'), ctrl.create);
router.patch('/:id', allow('admin'), ctrl.update);
router.delete('/:id', allow('admin'), ctrl.remove);

module.exports = router;
