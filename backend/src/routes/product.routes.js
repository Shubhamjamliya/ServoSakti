const router = require('express').Router();
const ctrl = require('../controllers/product.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/passports', allow('admin', 'oem', 'customer'), ctrl.listPassports);
router.post('/passports', allow('admin', 'oem', 'customer'), ctrl.createPassport);
router.patch('/passports/:id', allow('admin', 'oem', 'customer'), ctrl.updatePassport);
router.patch('/passports/:id/warranty', allow('admin', 'oem'), ctrl.verifyWarranty);
router.patch('/passports/:id/block', allow('admin'), ctrl.blockPassport);
router.patch('/passports/:id/transfer', allow('admin', 'customer'), ctrl.decideTransfer);
router.patch('/passports/:id/transfer-proof', allow('customer'), ctrl.transferProof);
router.get('/transfers', allow('admin', 'customer'), ctrl.listTransfers);
router.get('/', allow('admin', 'oem', 'customer'), ctrl.listProducts);
router.post('/', allow('admin', 'oem'), ctrl.createProduct);
router.patch('/:id', allow('admin', 'oem'), ctrl.updateProduct);
router.delete('/:id', allow('admin', 'oem'), ctrl.deleteProduct);

module.exports = router;
