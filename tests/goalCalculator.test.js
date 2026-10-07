/** Pure unit tests (no database): goal formulas. */
const calc = require('../backend/services/goalCalculator');

const NOW = new Date('2026-01-15T00:00:00Z');
const goal = (over = {}) => ({ _id: 'g1', name: 'Laptop', targetAmount: 60000, currentAmount: 0, monthlyContribution: 5000, targetDate: null, ...over });

describe('remaining and estimated months', () => {
  test('remaining = target - current; months = ceil(remaining / monthly)', () => {
    const d = calc.describe(goal({ currentAmount: 15000 }), NOW);
    expect(d.remaining).toBe(45000);
    expect(d.estimatedMonths).toBe(9);
    expect(d.progress).toBe(25);
    expect(d.status).toBe('active');
  });
  test('months are rounded UP (a partial month still needs a full month)', () => {
    expect(calc.describe(goal({ targetAmount: 10000, monthlyContribution: 3000 }), NOW).estimatedMonths).toBe(4);
  });
  test('no monthly contribution: cannot be estimated', () => {
    const d = calc.describe(goal({ monthlyContribution: 0 }), NOW);
    expect(d.estimatedMonths).toBeNull();
    expect(d.projectedCompletionDate).toBeNull();
  });
  test('projected completion date = today + estimated months', () => {
    const d = calc.describe(goal({ currentAmount: 15000 }), NOW);
    expect(d.projectedCompletionDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });
  test('month-end dates do not overflow (31 Jan + 1 month = 28 Feb)', () => {
    const d = calc.describe(goal({ targetAmount: 5000, monthlyContribution: 5000 }), new Date('2026-01-31T00:00:00Z'));
    expect(d.projectedCompletionDate.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
  test('a completed goal has nothing remaining and progress capped at 100%', () => {
    const d = calc.describe(goal({ currentAmount: 70000 }), NOW);
    expect(d).toMatchObject({ remaining: 0, estimatedMonths: 0, progress: 100, status: 'completed' });
  });
});

describe('target date: required monthly amount and contribution gap', () => {
  test('on track when the planned contribution finishes before the target date', () => {
    // 10 months left (approx), needs 6000/month, planning 10000/month
    const d = calc.describe(goal({ monthlyContribution: 10000, targetDate: new Date('2026-11-15T00:00:00Z') }), NOW);
    expect(d.monthsLeft).toBe(10);
    expect(d.requiredMonthly).toBe(6000);
    expect(d.contributionGap).toBe(0);
    expect(d.onTrack).toBe(true);
  });
  test('behind: the gap is required - planned', () => {
    const d = calc.describe(goal({ monthlyContribution: 4000, targetDate: new Date('2026-11-15T00:00:00Z') }), NOW);
    expect(d.requiredMonthly).toBe(6000);
    expect(d.contributionGap).toBe(2000);
    expect(d.onTrack).toBe(false);
  });
  test('target date in the past and goal not complete: not on track', () => {
    const d = calc.describe(goal({ targetDate: new Date('2025-12-01T00:00:00Z') }), NOW);
    expect(d.monthsLeft).toBe(0);
    expect(d.onTrack).toBe(false);
    expect(d.contributionGap).toBe(55000);
  });
  test('no target date: the date-based fields are null', () => {
    const d = calc.describe(goal(), NOW);
    expect([d.monthsLeft, d.requiredMonthly, d.contributionGap, d.onTrack]).toEqual([null, null, null, null]);
  });
});
