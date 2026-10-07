const express = require('express');
const controller = require('../controllers/regressionController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { asOfQuery } = require('../middleware/analyticsValidation');

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authenticate);
router.get('/', asOfQuery, validate, controller.get);

module.exports = router;