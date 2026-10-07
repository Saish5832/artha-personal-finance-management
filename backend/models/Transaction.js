/**
 * Transaction model (collection: transactions). Every document belongs to exactly one user (userId),
 * and every query in transactionService is scoped by that userId.
 * The "transaction ID" of the project spec is the document _id.
 */
const mongoose = require('mongoose');
const { TYPES, categoriesFor } = require('../utils/categories');
const { MAX_AMOUNT } = require('../utils/money');

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: [true, 'Type is required'], enum: { values: TYPES, message: 'Type must be income or expense' } },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      validate: {
        validator(value) { return categoriesFor(this.type).includes(value); },
        message: 'Category is not valid for this transaction type',
      },
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
      max: [MAX_AMOUNT, 'Amount is too large'],
    },
    date: { type: Date, required: [true, 'Date is required'] },
    description: { type: String, trim: true, maxlength: [200, 'Description must be at most 200 characters'], default: '' },
  },
  { timestamps: true }
);

// Most queries are "this user's transactions, newest first / within a date range / of one category".
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1, category: 1, date: -1 });

transactionSchema.set('toJSON', { transform: (doc, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('Transaction', transactionSchema);
