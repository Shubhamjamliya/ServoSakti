const router = require('express').Router();
const ctrl = require('../controllers/product.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/passports', allow('admin', 'oem', 'customer'), ctrl.listPassports);
router.post('/passports', allow('admin', 'oem', 'customer'), ctrl.createPassport);
router.patch('/passports/:id', allow('admin', 'oem', 'customer'), ctrl.updatePassport);
router.get('/', allow('admin', 'oem', 'customer'), ctrl.listProducts);
router.post('/', allow('admin', 'oem'), ctrl.createProduct);
router.patch('/:id', allow('admin', 'oem'), ctrl.updateProduct);
router.delete('/:id', allow('admin', 'oem'), ctrl.deleteProduct);

module.exports = router;
