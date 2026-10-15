const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/login', ctrl.login);
router.post('/send-otp', ctrl.sendOtp);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/register-customer', ctrl.registerCustomer);
router.post('/register-company', ctrl.registerCompany);
router.post('/register-engineer', ctrl.registerEngineer);
router.get('/me', protect, ctrl.me);

module.exports = router;
