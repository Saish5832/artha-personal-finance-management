const express = require('express');
const c = require('../controllers/goalController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { idRule, goalBodyRules, contributionRules, asOfQuery } = require('../middleware/goalValidation');

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authenticate);

router.get('/', asOfQuery(), validate, c.list);
router.post('/', goalBodyRules, validate, c.create);
router.get('/:id', idRule, asOfQuery(), validate, c.get);
router.put('/:id', idRule, goalBodyRules, validate, c.update);
router.post('/:id/contributions', idRule, contributionRules, validate, c.contribute);
router.delete('/:id', idRule, validate, c.remove);

module.exports = router;
