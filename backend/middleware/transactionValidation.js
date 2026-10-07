const { body, query, param } = require('express-validator');
const { TYPES, categoriesFor } = require('../utils/categories');
const { moneyBody, dateBody, stringBody, isoDate, isMoney } = require('./fieldRules');

const idRule = param('id').isMongoId().withMessage('Invalid transaction id');

const transactionBodyRules = [
  body('type').isString().withMessage('Type is required').bail().isIn(TYPES).withMessage('Type must be income or expense'),
  body('category')
    .isString().withMessage('Category is required').bail()
    .custom((value, { req }) => categoriesFor(req.body.type).includes(value))
    .withMessage('Category is not valid for this transaction type'),
  moneyBody('amount', { label: 'Amount' }),
  dateBody('date', 'Date'),
  stringBody('description', 'Description', { max: 200, required: false }),
];

const listRules = [
  query('type').optional().isString().bail().isIn(TYPES).withMessage('type must be income or expense'),
  query('category').optional().isString().withMessage('category must be text').bail().isLength({ max: 40 }),
  query('q').optional().isString().withMessage('q must be text').bail().trim().isLength({ max: 100 }).withMessage('Search text is too long'),
  isoDate(query('from').optional(), 'from'),
  isoDate(query('to').optional(), 'to'),
  query('minAmount').optional().custom(isMoney).withMessage('minAmount must be a number').bail().toFloat(),
  query('maxAmount').optional().custom(isMoney).withMessage('maxAmount must be a number').bail().toFloat(),
  query('sortBy').optional().isString().bail().isIn(['date', 'amount', 'createdAt']).withMessage('sortBy must be date, amount or createdAt'),
  query('order').optional().isString().bail().isIn(['asc', 'desc']).withMessage('order must be asc or desc'),
  query('page').optional().isInt({ min: 1, max: 100000 }).withMessage('page must be a positive integer').bail().toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100').bail().toInt(),
];

module.exports = { idRule, transactionBodyRules, listRules };
