/**
 * Budget business logic. Every query is scoped by userId (see transactionService for the ownership policy).
 * Actual spending is summed from the user's EXPENSE transactions in the budget's category inside the
 * current period window, so budgets always reflect the real transaction data.
 */
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const AppError = require('../utils/AppError');
const calc = require('./budgetCalculator');

const EDITABLE = ['category', 'amount', 'period'];
const pickEditable = (data) => Object.fromEntries(EDITABLE.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
const notFound = () => AppError.notFound('Budget not found');

async function spentIn(userId, category, window) {
  const rows = await Transaction.aggregate([
    { $match: { userId, type: 'expense', category, date: { $gte: window.start, $lt: window.end } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return rows.length ? rows[0].total : 0;
}

async function withSpending(userId, budget, asOf) {
  const window = calc.periodWindow(budget.period, asOf);
  return calc.describe(budget, await spentIn(userId, budget.category, window), window);
}

async function list(userId, { asOf = new Date(), period } = {}) {
  const filter = { userId };
  if (period) filter.period = period;
  const budgets = await Budget.find(filter).sort({ category: 1, period: 1 });
  const items = await Promise.all(budgets.map((b) => withSpending(userId, b, asOf)));
  return {
    items,
    summary: {
      count: items.length,
      overBudget: items.filter((b) => b.status === 'over').length,
      warning: items.filter((b) => b.status === 'warning' || b.status === 'critical').length,
    },
  };
}

async function getById(userId, id, asOf = new Date()) {
  const budget = await Budget.findOne({ _id: id, userId });
  if (!budget) throw notFound();
  return withSpending(userId, budget, asOf);
}

function duplicateError(err) {
  if (err.code === 11000) {
    const message = 'You already have a budget for this category and period';
    return AppError.conflict(message, { fields: { category: message } });
  }
  return err;
}

async function create(userId, data) {
  let budget;
  try {
    budget = await Budget.create({ ...pickEditable(data), userId });
  } catch (err) {
    throw duplicateError(err);
  }
  return withSpending(userId, budget, new Date());
}

async function update(userId, id, data) {
  const budget = await Budget.findOne({ _id: id, userId });
  if (!budget) throw notFound();
  budget.set(pickEditable(data));
  // Friendly pre-check; the unique index (caught below) still protects against two simultaneous requests.
  const clash = await Budget.exists({ userId, category: budget.category, period: budget.period, _id: { $ne: budget._id } });
  if (clash) throw duplicateError({ code: 11000 });
  try {
    await budget.save();
  } catch (err) {
    throw duplicateError(err);
  }
  return withSpending(userId, budget, new Date());
}

async function remove(userId, id) {
  const budget = await Budget.findOneAndDelete({ _id: id, userId });
  if (!budget) throw notFound();
  return budget;
}

module.exports = { list, getById, create, update, remove };
