const Transaction = require('../models/Transaction');
const budgetService = require('./budgetService');
const { runPython } = require('./pythonBridge');

async function analyzeUser(userId, asOf = new Date()) {
  const [transactions, budgets] = await Promise.all([
    Transaction.find({ userId })
      .select('type category amount date')
      .sort({ date: 1, _id: 1 })
      .lean(),
    budgetService.list(userId, { asOf }),
  ]);

  return runPython('eda', {
    transactions,
    budgets: budgets.items.map((budget) => ({
      category: budget.category,
      period: budget.period,
      amount: budget.amount,
      spent: budget.spent,
    })),
  });
}

module.exports = { analyzeUser };