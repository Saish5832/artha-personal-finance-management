const express = require('express');
const controller = require('../controllers/authController');
const validate = require('../middleware/validate');
const { registerRules, loginRules } = require('../middleware/authValidation');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Responses carry tokens/personal data: never let a browser or proxy cache them.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/register', registerRules, validate, controller.register);
router.post('/login', loginRules, validate, controller.login);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);

module.exports = router;
