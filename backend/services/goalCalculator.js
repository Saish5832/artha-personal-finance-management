/**
 * Pure savings-goal calculations (no database).
 *
 *   remaining        = target - current                     (never below 0)
 *   estimated months = ceil(remaining / monthly contribution)
 *
 * With a target date we also compute the monthly amount that WOULD be needed and the gap against
 * the planned contribution; the rule engine reuses "contributionGap" later.
 */
const { round2 } = require('../utils/money');

const DAYS_PER_MONTH = 30.4375;
const DAY_MS = 24 * 60 * 60 * 1000;

function addMonthsUTC(date, months) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

function describe(goal, asOf = new Date()) {
  const target = goal.targetAmount;
  const current = goal.currentAmount || 0;
  const monthly = goal.monthlyContribution || 0;

  const remaining = round2(Math.max(target - current, 0));
  const completed = remaining === 0;
  const progress = round2(Math.min((current / target) * 100, 100));

  let estimatedMonths = null; // null = cannot be estimated (no monthly contribution)
  if (completed) estimatedMonths = 0;
  else if (monthly > 0) estimatedMonths = Math.ceil(remaining / monthly);
  const projectedCompletionDate = estimatedMonths === null ? null : addMonthsUTC(asOf, estimatedMonths);

  let monthsLeft = null;
  let requiredMonthly = null;
  let contributionGap = null;
  let onTrack = null;
  if (goal.targetDate) {
    monthsLeft = Math.max(Math.ceil((goal.targetDate.getTime() - asOf.getTime()) / DAY_MS / DAYS_PER_MONTH), 0);
    if (completed) {
      requiredMonthly = 0;
      contributionGap = 0;
      onTrack = true;
    } else if (monthsLeft > 0) {
      requiredMonthly = round2(remaining / monthsLeft);
      contributionGap = round2(Math.max(requiredMonthly - monthly, 0));
      onTrack = estimatedMonths !== null && estimatedMonths <= monthsLeft;
    } else {
      // Target date has passed and the goal is not complete.
      requiredMonthly = remaining;
      contributionGap = round2(Math.max(remaining - monthly, 0));
      onTrack = false;
    }
  }

  return {
    _id: goal._id,
    name: goal.name,
    targetAmount: target,
    currentAmount: current,
    monthlyContribution: monthly,
    targetDate: goal.targetDate || null,
    status: completed ? 'completed' : 'active',
    remaining,
    progress,
    estimatedMonths,
    projectedCompletionDate,
    monthsLeft,
    requiredMonthly,
    contributionGap,
    onTrack,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

module.exports = { describe, addMonthsUTC };
