const router = require('express').Router();
const ctrl = require('../controllers/rateCard.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/', allow('admin', 'oem'), ctrl.list);
router.post('/', allow('admin', 'oem'), ctrl.create);
router.patch('/:id', allow('admin', 'oem'), ctrl.update);
router.delete('/:id', allow('admin', 'oem'), ctrl.remove);

module.exports = router;
