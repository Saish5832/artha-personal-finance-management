/**
 * Savings goal model (collection: goals). Derived values (remaining amount, estimated months,
 * progress, on-track) are calculated in services/goalCalculator.js, never stored.
 */
const mongoose = require('mongoose');
const { MAX_AMOUNT } = require('../utils/money');

const goalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: [true, 'Goal name is required'], trim: true, minlength: [2, 'Goal name must be at least 2 characters'], maxlength: [80, 'Goal name must be at most 80 characters'] },
    targetAmount: { type: Number, required: [true, 'Target amount is required'], min: [1, 'Target amount must be at least 1'], max: [MAX_AMOUNT, 'Target amount is too large'] },
    currentAmount: { type: Number, default: 0, min: [0, 'Current amount cannot be negative'], max: [MAX_AMOUNT, 'Current amount is too large'] },
    monthlyContribution: { type: Number, default: 0, min: [0, 'Monthly contribution cannot be negative'], max: [MAX_AMOUNT, 'Monthly contribution is too large'] },
    targetDate: { type: Date, default: null },
  },
  { timestamps: true }
);

goalSchema.index({ userId: 1, createdAt: -1 });

goalSchema.set('toJSON', { transform: (doc, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('Goal', goalSchema);
