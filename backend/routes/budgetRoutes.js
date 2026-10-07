const express = require('express');
const c = require('../controllers/budgetController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { idRule, budgetBodyRules, listRules, asOfQuery } = require('../middleware/budgetValidation');

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authenticate);

router.get('/', listRules, validate, c.list);
router.post('/', budgetBodyRules, validate, c.create);
router.get('/:id', idRule, asOfQuery(), validate, c.get);
router.put('/:id', idRule, budgetBodyRules, validate, c.update);
router.delete('/:id', idRule, validate, c.remove);

module.exports = router;
