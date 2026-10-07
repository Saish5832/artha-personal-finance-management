const { body, query, param } = require('express-validator');
const { EXPENSE_CATEGORIES } = require('../utils/categories');
const { PERIODS } = require('../models/Budget');
const { moneyBody, asOfQuery } = require('./fieldRules');

const idRule = param('id').isMongoId().withMessage('Invalid budget id');

const budgetBodyRules = [
  body('category').isString().withMessage('Category is required').bail().isIn(EXPENSE_CATEGORIES).withMessage('Budgets can only be set for expense categories'),
  moneyBody('amount', { label: 'Budget amount' }),
  body('period').optional().isString().withMessage('Period must be text').bail().isIn(PERIODS).withMessage('Period must be weekly, monthly or yearly'),
];

const listRules = [asOfQuery(), query('period').optional().isString().bail().isIn(PERIODS).withMessage('Period must be weekly, monthly or yearly')];

module.exports = { idRule, budgetBodyRules, listRules, asOfQuery };
