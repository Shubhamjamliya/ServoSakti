const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/', (req, res) => res.json({ module: 'rateCard', items: [] })); // TODO

module.exports = router;
