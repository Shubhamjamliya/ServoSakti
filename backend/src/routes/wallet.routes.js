const router = require('express').Router();
const ctrl = require('../controllers/wallet.controller');
const { protect, allow } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/me', allow('engineer', 'vendor_owner', 'customer'), ctrl.me);
router.get('/txns', allow('admin', 'engineer', 'vendor_owner', 'customer'), ctrl.txns);
router.get('/', allow('admin'), ctrl.list);
router.put('/bank', allow('engineer', 'vendor_owner'), ctrl.setBank);
router.post('/adjust', allow('admin'), ctrl.adjust);

router.get('/withdrawals', allow('admin', 'engineer', 'vendor_owner'), ctrl.listWithdrawals);
router.post('/withdrawals', allow('engineer', 'vendor_owner'), ctrl.requestWithdrawal);
router.patch('/withdrawals/:id', allow('admin'), ctrl.decideWithdrawal);

router.get('/cash/holders', allow('admin', 'vendor_owner'), ctrl.cashHolders);
router.post('/cash/handover', allow('vendor_owner'), ctrl.handover);
router.post('/cash/receive', allow('admin'), ctrl.receiveCash);
router.get('/cash/deposits', allow('admin', 'vendor_owner', 'engineer'), ctrl.listDeposits);
router.post('/cash/deposits', allow('vendor_owner', 'engineer'), ctrl.submitDeposit);
router.patch('/cash/deposits/:id', allow('admin'), ctrl.decideDeposit);

module.exports = router;
