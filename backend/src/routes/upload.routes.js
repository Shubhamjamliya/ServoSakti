const router = require('express').Router();
const ctrl = require('../controllers/upload.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/', protect, ctrl.middleware, ctrl.handler);

module.exports = router;
