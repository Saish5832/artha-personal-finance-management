const express = require('express');
const c = require('../controllers/transactionController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { idRule, transactionBodyRules, listRules } = require('../middleware/transactionValidation');

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }); // personal financial data
router.use(authenticate); // every transaction route requires a valid JWT

router.get('/categories', c.categories);
router.get('/', listRules, validate, c.list);
router.post('/', transactionBodyRules, validate, c.create);
router.get('/:id', idRule, validate, c.get);
router.put('/:id', idRule, transactionBodyRules, validate, c.update);
router.delete('/:id', idRule, validate, c.remove);

module.exports = router;
