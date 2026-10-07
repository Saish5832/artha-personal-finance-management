/**
 * Input validation rules for the auth endpoints (express-validator).
 *
 * Every field is first required to be a STRING. That blocks NoSQL-operator injection such as
 * { "email": { "$ne": null } }, which would otherwise be passed to MongoDB as a query operator.
 * Only name/email/password are ever read, so extra fields in the body (e.g. "passwordHash",
 * "_id", "role") are ignored and cannot be mass-assigned.
 */
const { body } = require('express-validator');

const MAX_PASSWORD_BYTES = 72; // bcrypt only uses the first 72 bytes

const emailRule = () =>
  body('email')
    .isString().withMessage('Email is required').bail()
    .trim()
    .toLowerCase()
    .notEmpty().withMessage('Email is required').bail()
    .isLength({ max: 254 }).withMessage('Email must be at most 254 characters').bail()
    .isEmail().withMessage('Please enter a valid email address');

const registerRules = [
  body('name')
    .isString().withMessage('Name is required').bail()
    .trim()
    .isLength({ min: 2, max: 60 }).withMessage('Name must be between 2 and 60 characters'),
  emailRule(),
  body('password')
    .isString().withMessage('Password is required').bail()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters').bail()
    .custom((value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES)
    .withMessage('Password must be at most 72 characters').bail()
    .matches(/[A-Za-z]/).withMessage('Password must contain at least one letter').bail()
    .matches(/\d/).withMessage('Password must contain at least one number'),
];

// Login does not re-check password strength (old accounts must still be able to log in);
// it only requires well-formed input.
const loginRules = [
  emailRule(),
  body('password')
    .isString().withMessage('Password is required').bail()
    .notEmpty().withMessage('Password is required').bail()
    .custom((value) => Buffer.byteLength(value, 'utf8') <= 1024).withMessage('Password is too long'),
];

module.exports = { registerRules, loginRules };
