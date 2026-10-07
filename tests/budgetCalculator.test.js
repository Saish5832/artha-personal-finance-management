/** Pure unit tests (no database): budget formulas, status thresholds and period windows. */
const calc = require('../backend/services/budgetCalculator');

describe('utilization = spent / budget x 100', () => {
  test.each([
    [0, 1000, 0],
    [500, 1000, 50],
    [800, 1000, 80],
    [1000, 1000, 100],
    [1250, 1000, 125],
    [333.33, 1000, 33.33],
  ])('spent %p of %p -> %p%%', (spent, amount, expected) => {
    expect(calc.utilization(spent, amount)).toBe(expected);
  });

  test('a zero or missing budget never divides by zero', () => {
    expect(calc.utilization(100, 0)).toBe(0);
    expect(calc.utilization(100, undefined)).toBe(0);
  });
});

describe('status thresholds (>80 warning, >90 critical, >=100 over)', () => {
  test.each([
    [0, 'ok'], [79.99, 'ok'], [80, 'ok'], [80.01, 'warning'], [90, 'warning'],
    [90.01, 'critical'], [99.99, 'critical'], [100, 'over'], [250, 'over'],
  ])('%p%% -> %s', (percent, status) => {
    expect(calc.statusFor(percent)).toBe(status);
  });
});

describe('periodWindow (UTC, [start, end))', () => {
  test('monthly: the calendar month containing the date', () => {
    const w = calc.periodWindow('monthly', new Date('2026-03-15T10:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
  test('monthly: December rolls into January of the next year', () => {
    const w = calc.periodWindow('monthly', new Date('2026-12-31T23:59:00Z'));
    expect(w.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
  test('weekly: Monday to the next Monday', () => {
    const w = calc.periodWindow('weekly', new Date('2026-10-06T12:00:00Z')); // a Tuesday
    expect(w.start.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });
  test('weekly: a Sunday belongs to the week that started the previous Monday', () => {
    const w = calc.periodWindow('weekly', new Date('2026-10-11T08:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
  test('yearly: the calendar year', () => {
    const w = calc.periodWindow('yearly', new Date('2026-06-01T00:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('describe()', () => {
  const window = { start: new Date('2026-03-01T00:00:00Z'), end: new Date('2026-04-01T00:00:00Z') };
  const budget = { _id: 'b1', category: 'Food', amount: 5000, period: 'monthly' };

  test('under budget', () => {
    const d = calc.describe(budget, 2000, window);
    expect(d).toMatchObject({ spent: 2000, remaining: 3000, utilization: 40, status: 'ok', overBudget: false, alert: null });
  });
  test('over budget has a negative remaining amount and an alert', () => {
    const d = calc.describe(budget, 6000, window);
    expect(d).toMatchObject({ remaining: -1000, utilization: 120, status: 'over', overBudget: true });
    expect(d.alert).toMatch(/exceeded/);
  });
  test('spending exactly equal to the budget counts as over (spending >= budget)', () => {
    expect(calc.describe(budget, 5000, window).overBudget).toBe(true);
  });
});
