const router = require('express').Router();
const ctrl = require('../controllers/catalog.controller');
const { protect } = require('../middleware/auth.middleware');

// Write access is decided per catalogue inside the controller (admin everywhere, OEMs on their own plans).
router.use(protect);
router.get('/:resource', ctrl.list);
router.post('/:resource', ctrl.create);
router.patch('/:resource/:id', ctrl.update);
router.delete('/:resource/:id', ctrl.remove);

module.exports = router;
