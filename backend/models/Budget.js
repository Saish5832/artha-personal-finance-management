/**
 * Budget model (collection: budgets): a spending limit for one expense category and one period.
 * "Actual spending" and "utilization" are NOT stored; they are calculated from the user's
 * transactions on every read (services/budgetService.js), so they can never go out of date.
 */
const mongoose = require('mongoose');
const { EXPENSE_CATEGORIES } = require('../utils/categories');
const { MAX_AMOUNT } = require('../utils/money');

const PERIODS = ['weekly', 'monthly', 'yearly'];

const budgetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: [true, 'Category is required'], enum: { values: EXPENSE_CATEGORIES, message: 'Budgets can only be set for expense categories' } },
    amount: {
      type: Number,
      required: [true, 'Budget amount is required'],
      min: [0.01, 'Budget amount must be greater than zero'],
      max: [MAX_AMOUNT, 'Budget amount is too large'],
    },
    period: { type: String, enum: { values: PERIODS, message: 'Period must be weekly, monthly or yearly' }, default: 'monthly' },
  },
  { timestamps: true }
);

// One budget per category per period for each user (the database enforces it, even for racing requests).
budgetSchema.index({ userId: 1, category: 1, period: 1 }, { unique: true });

budgetSchema.set('toJSON', { transform: (doc, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('Budget', budgetSchema);
module.exports.PERIODS = PERIODS;
