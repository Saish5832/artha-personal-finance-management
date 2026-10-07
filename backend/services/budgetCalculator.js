/**
 * Pure budget calculations (no database): easy to unit test and to explain in a viva.
 *
 *   utilization % = (actual spending / budget) x 100
 *
 * Status thresholds are exported so the rule engine (later phase) uses the very same numbers.
 */
const { round2 } = require('../utils/money');

const THRESHOLDS = { warning: 80, critical: 90, over: 100 };
const DAY_MS = 24 * 60 * 60 * 1000;

/** [start, end) of the budget period that contains `asOf`, in UTC. */
function periodWindow(period, asOf = new Date()) {
  const y = asOf.getUTCFullYear();
  const m = asOf.getUTCMonth();
  if (period === 'yearly') return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y + 1, 0, 1)) };
  if (period === 'weekly') {
    const dayStart = Date.UTC(y, m, asOf.getUTCDate());
    const sinceMonday = (asOf.getUTCDay() + 6) % 7; // Monday = 0
    const start = new Date(dayStart - sinceMonday * DAY_MS);
    return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
  }
  return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) }; // monthly
}

function utilization(spent, budgetAmount) {
  if (!(budgetAmount > 0)) return 0;
  return round2((spent / budgetAmount) * 100);
}

/** ok < 80 <= warning (> 80) ; critical > 90 ; over >= 100 */
function statusFor(percent) {
  if (percent >= THRESHOLDS.over) return 'over';
  if (percent > THRESHOLDS.critical) return 'critical';
  if (percent > THRESHOLDS.warning) return 'warning';
  return 'ok';
}

const ALERT_TEXT = {
  ok: null,
  warning: 'More than 80% of this budget is used.',
  critical: 'More than 90% of this budget is used.',
  over: 'Spending has reached or exceeded this budget.',
};

/** Combine a budget document with its actual spending into the object the API returns. */
function describe(budget, spent, window) {
  const amount = budget.amount;
  const spentRounded = round2(spent);
  const percent = utilization(spentRounded, amount);
  const status = statusFor(percent);
  return {
    _id: budget._id,
    category: budget.category,
    amount,
    period: budget.period,
    periodStart: window.start,
    periodEnd: window.end,
    spent: spentRounded,
    remaining: round2(amount - spentRounded), // negative when over budget
    utilization: percent,
    status,
    overBudget: status === 'over',
    alert: ALERT_TEXT[status],
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
  };
}

module.exports = { THRESHOLDS, periodWindow, utilization, statusFor, describe };
