const { body, param } = require('express-validator');
const { moneyBody, dateBody, stringBody, asOfQuery } = require('./fieldRules');

const idRule = param('id').isMongoId().withMessage('Invalid goal id');

const goalBodyRules = [
  stringBody('name', 'Goal name', { min: 2, max: 80 }),
  moneyBody('targetAmount', { label: 'Target amount', min: 1 }),
  moneyBody('currentAmount', { label: 'Current amount', min: 0, required: false, defaultValue: 0 }),
  moneyBody('monthlyContribution', { label: 'Monthly contribution', min: 0, required: false, defaultValue: 0 }),
  dateBody('targetDate', 'Target date', { required: false }),
];

const contributionRules = [moneyBody('amount', { label: 'Contribution amount' })];

module.exports = { idRule, goalBodyRules, contributionRules, asOfQuery };
