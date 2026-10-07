const { round2 } = require('../utils/money');

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function chartMonths(asOf, count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - count + index + 1, 1));
    return { key: monthKey(date), start: date };
  });
}

function calculateDashboard({ asOf, transactionData, budgetData, goalData }) {
  const months = chartMonths(asOf);
  const monthlyRows = new Map(transactionData.monthly.map((row) => [row._id, row]));
  const monthly = months.map(({ key }) => {
    const row = monthlyRows.get(key) || {};
    return { income: round2(row.income || 0), expense: round2(row.expense || 0) };
  });

  const totals = transactionData.totals[0] || { income: 0, expense: 0, count: 0 };
  const totalIncome = round2(totals.income);
  const totalExpenses = round2(totals.expense);
  const netSavings = round2(totalIncome - totalExpenses);
  const budgetAmount = budgetData.items.reduce((sum, budget) => sum + budget.amount, 0);
  const budgetSpent = budgetData.items.reduce((sum, budget) => sum + budget.spent, 0);
  const overBudgetCount = budgetData.items.filter((budget) => budget.overBudget).length;
  const currentMonthIndex = months.length - 1;
  const previousMonthIndex = months.length - 2;
  const currentMonthExpense = monthly[currentMonthIndex].expense;
  const previousMonthExpense = monthly[previousMonthIndex].expense;
  const categoryRows = [...transactionData.allCategories].sort((a, b) => b.amount - a.amount || a._id.localeCompare(b._id));
  const highestCategory = categoryRows[0];

  const summary = {
    totalIncome,
    totalExpenses,
    netSavings,
    savingsRate: totalIncome > 0 ? round2((netSavings / totalIncome) * 100) : null,
    budgetUtilization: budgetAmount > 0 ? round2((budgetSpent / budgetAmount) * 100) : 0,
    activeGoals: goalData.summary.active,
    transactionCount: totals.count,
    highestSpendingCategory: highestCategory
      ? { category: highestCategory._id, amount: round2(highestCategory.amount) }
      : null,
    overBudgetCount,
    monthlyExpenseChange: {
      amount: round2(currentMonthExpense - previousMonthExpense),
      percent: previousMonthExpense > 0
        ? round2(((currentMonthExpense - previousMonthExpense) / previousMonthExpense) * 100)
        : null,
      current: currentMonthExpense,
      previous: previousMonthExpense,
    },
  };

  summary.financialHealth = financialHealth(summary, budgetData.items.length);

  return {
    asOf: asOf.toISOString(),
    summary,
    recentTransactions: transactionData.recent,
    charts: {
      monthlyIncomeExpense: {
        labels: months.map(({ key }) => key),
        income: monthly.map((row) => row.income),
        expenses: monthly.map((row) => row.expense),
      },
      monthlyExpenseTrend: {
        labels: months.map(({ key }) => key),
        expenses: monthly.map((row) => row.expense),
      },
      expenseByCategory: {
        labels: transactionData.chartCategories.map((row) => row._id),
        values: transactionData.chartCategories.map((row) => round2(row.amount)),
      },
      budgetVsActual: {
        labels: budgetData.items.map((budget) => `${budget.category} (${budget.period})`),
        budget: budgetData.items.map((budget) => budget.amount),
        actual: budgetData.items.map((budget) => budget.spent),
      },
      savingsTrend: {
        labels: months.map(({ key }) => key),
        values: monthly.map((row) => round2(row.income - row.expense)),
      },
    },
  };
}

function financialHealth(summary, budgetCount) {
  if (summary.transactionCount === 0) {
    return { status: 'no_data', title: 'No transaction history', details: ['No financial activity is available to summarize yet.'] };
  }

  const needsAttention = summary.netSavings < 0 || summary.overBudgetCount > 0;
  const details = [
    summary.netSavings < 0
      ? `Recorded expenses exceed income by ${summary.netSavings * -1}.`
      : `Recorded net savings are ${summary.netSavings}${summary.savingsRate === null ? '.' : ` (${summary.savingsRate}% of income).`}`,
    budgetCount > 0
      ? `${summary.overBudgetCount} of ${budgetCount} budgets are over their limit.`
      : 'No budgets are configured.',
    `${summary.activeGoals} active savings goal${summary.activeGoals === 1 ? '' : 's'}.`,
  ];

  return {
    status: needsAttention ? 'attention' : 'steady',
    title: needsAttention ? 'Review your current metrics' : 'Positive cash flow',
    details,
  };
}

module.exports = { calculateDashboard, chartMonths, financialHealth, monthKey };