const { round2 } = require('../utils/money');

const SEVERITY_ORDER = { CRITICAL: 3, WARNING: 2, INFO: 1 };

function formatMoney(value) {
  const safe = Number(value || 0);
  return `₹${safe.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(safe) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function buildAlert({ ruleId, ruleName, severity, category, condition, threshold, actualValue, recommendation, reason }) {
  return {
    ruleId,
    ruleName,
    severity,
    category: category || 'Overall',
    condition,
    threshold,
    actualValue: actualValue !== undefined && actualValue !== null ? round2(actualValue) : actualValue,
    recommendation,
    reason,
  };
}

function sortAlerts(alerts) {
  return [...alerts].sort((a, b) => {
    const severityDelta = (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
    if (severityDelta !== 0) return severityDelta;
    return (a.ruleId || '').localeCompare(b.ruleId || '');
  });
}

function getGoalList(context) {
  if (Array.isArray(context.goals)) return context.goals;
  if (context.goals && Array.isArray(context.goals.items)) return context.goals.items;
  return [];
}

function getBudgetList(context) {
  if (Array.isArray(context.budgets)) return context.budgets;
  if (context.budgets && Array.isArray(context.budgets.items)) return context.budgets.items;
  return [];
}

function getCategoryTotals(context) {
  if (Array.isArray(context.categoryTotals)) return context.categoryTotals;
  return [];
}

function evaluate(context = {}) {
  const budgets = getBudgetList(context);
  const goals = getGoalList(context);
  const categoryTotals = getCategoryTotals(context);
  const alerts = [];
  const seen = new Set();

  const pushAlert = (alert) => {
    if (!alert) return;
    const key = `${alert.ruleId}:${alert.category}:${alert.threshold}:${alert.actualValue}`;
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push(alert);
  };

  for (const budget of budgets) {
    const utilization = Number(budget.utilization ?? 0);
    if (utilization >= 100) {
      pushAlert(buildAlert({
        ruleId: 'HIGH_BUDGET_UTILIZATION',
        ruleName: 'High Budget Utilization',
        severity: 'CRITICAL',
        category: budget.category,
        condition: 'Budget utilization >= 100%',
        threshold: 100,
        actualValue: utilization,
        recommendation: `Reduce spending in this category.`,
        reason: `You have used ${utilization}% of your ${budget.category} budget.`,
      }));
      continue;
    }
    if (utilization >= 90) {
      pushAlert(buildAlert({
        ruleId: 'HIGH_BUDGET_UTILIZATION',
        ruleName: 'High Budget Utilization',
        severity: 'WARNING',
        category: budget.category,
        condition: 'Budget utilization >= 90%',
        threshold: 90,
        actualValue: utilization,
        recommendation: `Review your ${budget.category} expenditure.`,
        reason: `You have used ${utilization}% of your ${budget.category} budget.`,
      }));
      continue;
    }
    if (utilization >= 80) {
      pushAlert(buildAlert({
        ruleId: 'HIGH_BUDGET_UTILIZATION',
        ruleName: 'High Budget Utilization',
        severity: 'INFO',
        category: budget.category,
        condition: 'Budget utilization >= 80%',
        threshold: 80,
        actualValue: utilization,
        recommendation: 'Monitor your spending in this category.',
        reason: `You have used ${utilization}% of your ${budget.category} budget.`,
      }));
    }
  }

  const totalIncome = Number(context.totalIncome ?? context.currentMonthIncome ?? 0);
  const totalExpense = Number(context.totalExpense ?? context.currentMonthExpenses ?? 0);
  if (totalExpense > totalIncome) {
    const diff = round2(totalExpense - totalIncome);
    pushAlert(buildAlert({
      ruleId: 'EXPENSES_EXCEED_INCOME',
      ruleName: 'Expenses Exceed Income',
      severity: 'CRITICAL',
      category: 'Overall',
      condition: 'Total monthly expenses > total monthly income',
      threshold: 0,
      actualValue: diff,
      recommendation: 'Review your monthly expenditure.',
      reason: `Your expenses are ${formatMoney(diff)} greater than your recorded income.`,
    }));
  }

  for (const goal of goals) {
    if (goal.status === 'completed') continue;
    const requiredMonthly = Number(goal.requiredMonthly ?? 0);
    const currentAmount = Number(goal.currentAmount ?? 0);
    if (requiredMonthly > 0 && currentAmount < requiredMonthly) {
      pushAlert(buildAlert({
        ruleId: 'SAVINGS_GOAL_SHORTFALL',
        ruleName: 'Savings Goal Shortfall',
        severity: 'WARNING',
        category: goal.name || 'Goal',
        condition: 'Current savings < required savings/contribution needed for the selected goal',
        threshold: requiredMonthly,
        actualValue: currentAmount,
        recommendation: 'Increase your monthly savings.',
        reason: 'Your current savings are below the amount required to reach your selected goal.',
      }));
    }
  }

  if (totalExpense > 0) {
    for (const item of categoryTotals) {
      const category = item.category;
      const total = Number(item.total || 0);
      const percentage = round2((total / totalExpense) * 100);
      if (percentage > 40) {
        pushAlert(buildAlert({
          ruleId: 'CATEGORY_CONCENTRATION',
          ruleName: 'Category Concentration',
          severity: 'WARNING',
          category,
          condition: 'A category accounts for more than 40% of total expenditure',
          threshold: 40,
          actualValue: percentage,
          recommendation: 'Review spending in this category.',
          reason: `This category represents ${percentage}% of your total expenditure.`,
        }));
      }
    }
  }

  const savingsRate = context.savingsRate !== undefined && context.savingsRate !== null ? Number(context.savingsRate) : (totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : null);
  if (Number.isFinite(savingsRate) && totalIncome > 0 && savingsRate < 20) {
    pushAlert(buildAlert({
      ruleId: 'LOW_SAVINGS_RATE',
      ruleName: 'Low Savings Rate',
      severity: 'WARNING',
      category: 'Overall',
      condition: 'Savings rate < 20%',
      threshold: 20,
      actualValue: round2(savingsRate),
      recommendation: 'Review your savings and expenditure.',
      reason: `Your current savings rate is ${round2(savingsRate)}%.`,
    }));
  }

  const monthSeries = Array.isArray(context.monthlyExpenseByMonth) ? context.monthlyExpenseByMonth : [];
  const currentMonthExpense = Number(context.currentMonthExpenses ?? (monthSeries[0] && monthSeries[0].total) ?? 0);
  const previousMonthExpense = Number(context.previousMonthExpense ?? (monthSeries[1] && monthSeries[1].total) ?? 0);
  if (previousMonthExpense > 0 && currentMonthExpense > previousMonthExpense) {
    const delta = ((currentMonthExpense - previousMonthExpense) / previousMonthExpense) * 100;
    if (delta > 20) {
      pushAlert(buildAlert({
        ruleId: 'MONTHLY_SPENDING_SPIKE',
        ruleName: 'Monthly Spending Spike',
        severity: 'WARNING',
        category: 'Overall',
        condition: 'Current month expenditure > 20% higher than previous month expenditure',
        threshold: 20,
        actualValue: round2(delta),
        recommendation: 'Review your recent spending increase.',
        reason: `Your expenditure increased by ${round2(delta)}% compared with the previous month.`,
      }));
    }
  }

  const monthlyBudgetOverages = Array.isArray(context.monthlyBudgetOverages) ? context.monthlyBudgetOverages : [];
  for (const item of monthlyBudgetOverages) {
    const count = Number(item.count || 0);
    if (count >= 2) {
      pushAlert(buildAlert({
        ruleId: 'REPEATED_CATEGORY_OVERSPENDING',
        ruleName: 'Repeated Category Overspending',
        severity: 'WARNING',
        category: item.category,
        condition: 'A category exceeds its budget for multiple consecutive months',
        threshold: 2,
        actualValue: count,
        recommendation: `Review your recurring ${item.category} overspending.`,
        reason: `${item.category} has exceeded its budget for ${count} consecutive months.`,
      }));
    }
  }

  for (const goal of goals) {
    if (goal.status === 'completed') continue;
    const requiredMonthly = Number(goal.requiredMonthly ?? 0);
    const monthlyContribution = Number(goal.monthlyContribution ?? 0);
    if (requiredMonthly > 0 && monthlyContribution < requiredMonthly) {
      pushAlert(buildAlert({
        ruleId: 'GOAL_CONTRIBUTION_GAP',
        ruleName: 'Goal Contribution Gap',
        severity: 'WARNING',
        category: goal.name || 'Goal',
        condition: 'Actual monthly contribution is below the expected monthly contribution',
        threshold: requiredMonthly,
        actualValue: monthlyContribution,
        recommendation: 'Increase your monthly contribution toward this goal.',
        reason: `Your current contribution is ${formatMoney(monthlyContribution)} compared with the expected ${formatMoney(requiredMonthly)} per month.`,
      }));
    }
  }

  for (const budget of budgets) {
    const utilization = Number(budget.utilization ?? 0);
    const remaining = Number(budget.remaining ?? 0);
    const amount = Number(budget.amount ?? 0);
    if (amount <= 0 || utilization >= 100) continue;
    if (remaining <= amount * 0.1 && remaining >= 0) {
      pushAlert(buildAlert({
        ruleId: 'LOW_REMAINING_BUDGET',
        ruleName: 'Low Remaining Budget',
        severity: 'WARNING',
        category: budget.category,
        condition: 'Remaining budget <= 10% of original budget and budget utilization < 100%',
        threshold: 10,
        actualValue: remaining,
        recommendation: 'Limit further spending in this category.',
        reason: `Only ${formatMoney(remaining)} remains in your ${budget.category} budget.`,
      }));
    }
  }

  return sortAlerts(alerts);
}

module.exports = { evaluate, buildAlert, sortAlerts };
