const Transaction = require('../models/Transaction');
const budgetService = require('./budgetService');
const goalService = require('./goalService');
const { evaluate } = require('./ruleEngine');
const { round2 } = require('../utils/money');

function monthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthStart(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function sumBy(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function buildMonthlyExpenseSeries(transactions, asOf) {
  const months = [];
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const currentYear = asOfDate.getUTCFullYear();
  const currentMonth = asOfDate.getUTCMonth();
  for (let offset = 0; offset < 6; offset += 1) {
    const monthDate = new Date(Date.UTC(currentYear, currentMonth - offset, 1));
    const monthKeyValue = monthKey(monthDate);
    const monthStartDate = monthStart(monthDate);
    const monthEndDate = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1));
    const total = transactions
      .filter((tx) => tx.type === 'expense' && tx.date >= monthStartDate && tx.date < monthEndDate)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    months.push({ month: monthKeyValue, total: round2(total) });
  }
  return months;
}

function buildCategoryTotals(transactions, asOf) {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const monthStartDate = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), 1));
  const monthEndDate = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth() + 1, 1));
  const map = new Map();
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const withinMonth = tx.date >= monthStartDate && tx.date < monthEndDate;
    if (!withinMonth) continue;
    const key = tx.category;
    map.set(key, (map.get(key) || 0) + Number(tx.amount || 0));
  }
  return Array.from(map.entries()).map(([category, total]) => ({ category, total: round2(total) }));
}

function buildMonthlyBudgetOverages(budgets, transactions, asOf) {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const budgetByCategory = new Map();
  for (const budget of budgets) {
    const key = budget.category;
    if (!budgetByCategory.has(key) || (budget.period || 'monthly') === 'monthly') {
      budgetByCategory.set(key, Number(budget.amount || 0));
    }
  }

  const months = [];
  const year = asOfDate.getUTCFullYear();
  const month = asOfDate.getUTCMonth();
  for (let offset = 0; offset < 6; offset += 1) {
    const monthDate = new Date(Date.UTC(year, month - offset, 1));
    const start = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1));
    const end = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1));
    months.push({ month: monthKey(monthDate), start, end });
  }

  const categoryCounts = new Map();
  for (const [category, budgetAmount] of budgetByCategory.entries()) {
    let streak = 0;
    let maxStreak = 0;
    for (const monthWindow of months) {
      const spent = transactions
        .filter((tx) => tx.type === 'expense' && tx.category === category && tx.date >= monthWindow.start && tx.date < monthWindow.end)
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      if (spent > budgetAmount) {
        streak += 1;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }
    if (maxStreak >= 2) categoryCounts.set(category, maxStreak);
  }

  return Array.from(categoryCounts.entries()).map(([category, count]) => ({ category, count }));
}

async function getAlerts(userId, asOf = new Date()) {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const [transactions, budgetsResult, goalsResult] = await Promise.all([
    Transaction.find({ userId }).sort({ date: 1, createdAt: 1, _id: 1 }),
    budgetService.list(userId, { asOf: asOfDate }),
    goalService.list(userId, asOfDate),
  ]);

  const budgets = budgetsResult.items || [];
  const goals = goalsResult.items || [];

  const currentMonthStart = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), 1));
  const currentMonthEnd = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth() + 1, 1));
  const previousMonthStart = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth() - 1, 1));
  const previousMonthEnd = currentMonthStart;

  const currentMonthTx = transactions.filter((tx) => tx.date >= currentMonthStart && tx.date < currentMonthEnd);
  const previousMonthTx = transactions.filter((tx) => tx.date >= previousMonthStart && tx.date < previousMonthEnd);

  const totalIncome = round2(sumBy(currentMonthTx.filter((tx) => tx.type === 'income'), 'amount'));
  const totalExpense = round2(sumBy(currentMonthTx.filter((tx) => tx.type === 'expense'), 'amount'));
  const previousMonthExpense = round2(sumBy(previousMonthTx.filter((tx) => tx.type === 'expense'), 'amount'));
  const monthlyExpenseByMonth = buildMonthlyExpenseSeries(transactions, asOfDate);
  const categoryTotals = buildCategoryTotals(transactions, asOfDate);
  const monthlyBudgetOverages = buildMonthlyBudgetOverages(budgets, transactions, asOfDate);
  const savingsRate = totalIncome > 0 ? round2(((totalIncome - totalExpense) / totalIncome) * 100) : null;

  const context = {
    budgets,
    goals,
    transactions,
    asOf: asOfDate,
    totalIncome,
    totalExpense,
    currentMonthIncome: totalIncome,
    currentMonthExpenses: totalExpense,
    previousMonthExpense,
    monthlyExpenseByMonth,
    categoryTotals,
    monthlyBudgetOverages,
    savingsRate,
  };

  const alerts = evaluate(context);
  const summary = {
    totalAlerts: alerts.length,
    critical: alerts.filter((x) => x.severity === 'CRITICAL').length,
    warning: alerts.filter((x) => x.severity === 'WARNING').length,
    info: alerts.filter((x) => x.severity === 'INFO').length,
  };

  return {
    asOf: asOfDate.toISOString().slice(0, 10),
    summary,
    alerts,
  };
}

module.exports = { getAlerts, buildMonthlyExpenseSeries, buildCategoryTotals, buildMonthlyBudgetOverages };
