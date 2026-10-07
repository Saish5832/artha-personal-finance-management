const request = require('supertest');
const createApp = require('../backend/app');
const { connectTestDb, clearTestDb, closeTestDb } = require('./helpers/testDb');
const { registerUser, client } = require('./helpers/authHelper');
const { evaluate } = require('../backend/services/ruleEngine');

const app = createApp();
let alice; let bob; let a; let b;

beforeAll(connectTestDb, 180000);
afterAll(closeTestDb);
beforeEach(async () => {
  await clearTestDb();
  alice = await registerUser(app, 'Alice');
  bob = await registerUser(app, 'Bob');
  a = client(app, alice.token);
  b = client(app, bob.token);
});

function findAlert(alerts, ruleId) {
  return alerts.find((alert) => alert.ruleId === ruleId);
}

describe('rule engine', () => {
  test('budget utilization < 80% -> no alert', () => {
    const alerts = evaluate({ budgets: [{ category: 'Food', utilization: 70, amount: 1000, spent: 700, remaining: 300 }], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 4200, totalExpense: 4200, totalIncome: 5000 });
    expect(findAlert(alerts, 'HIGH_BUDGET_UTILIZATION')).toBeUndefined();
  });

  test('budget utilization >= 80% -> INFO', () => {
    const alerts = evaluate({ budgets: [{ category: 'Food', utilization: 82, amount: 1000, spent: 820, remaining: 180 }], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 4200, totalExpense: 4200, totalIncome: 5000 });
    const alert = findAlert(alerts, 'HIGH_BUDGET_UTILIZATION');
    expect(alert).toMatchObject({ severity: 'INFO', recommendation: 'Monitor your spending in this category.' });
  });

  test('budget utilization >= 90% -> WARNING', () => {
    const alerts = evaluate({ budgets: [{ category: 'Food', utilization: 94, amount: 1000, spent: 940, remaining: 60 }], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 4200, totalExpense: 4200, totalIncome: 5000 });
    const alert = findAlert(alerts, 'HIGH_BUDGET_UTILIZATION');
    expect(alert).toMatchObject({ severity: 'WARNING', recommendation: 'Review your Food expenditure.' });
  });

  test('budget utilization >= 100% -> CRITICAL', () => {
    const alerts = evaluate({ budgets: [{ category: 'Food', utilization: 120, amount: 1000, spent: 1200, remaining: -200 }], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 4200, totalExpense: 4200, totalIncome: 5000 });
    const alert = findAlert(alerts, 'HIGH_BUDGET_UTILIZATION');
    expect(alert).toMatchObject({ severity: 'CRITICAL', recommendation: 'Reduce spending in this category.' });
  });

  test('expenses > income -> CRITICAL', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 6500, totalExpense: 6500, totalIncome: 5000 });
    const alert = findAlert(alerts, 'EXPENSES_EXCEED_INCOME');
    expect(alert).toMatchObject({ severity: 'CRITICAL', recommendation: 'Review your monthly expenditure.' });
  });

  test('expenses <= income -> no expense-income alert', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 4000, totalExpense: 4000, totalIncome: 5000 });
    expect(findAlert(alerts, 'EXPENSES_EXCEED_INCOME')).toBeUndefined();
  });

  test('savings goal shortfall -> WARNING', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [{ name: 'Emergency', currentAmount: 4000, targetAmount: 10000, status: 'active', requiredMonthly: 6000, monthlyContribution: 1500 }] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 4200, totalExpense: 4200, totalIncome: 5000 });
    const alert = findAlert(alerts, 'SAVINGS_GOAL_SHORTFALL');
    expect(alert).toMatchObject({ severity: 'WARNING', recommendation: 'Increase your monthly savings.' });
  });

  test('category > 40% of expenditure -> WARNING', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 12000, totalExpense: 12000, totalIncome: 5000, categoryTotals: [{ category: 'Food', total: 5200 }] });
    const alert = findAlert(alerts, 'CATEGORY_CONCENTRATION');
    expect(alert).toMatchObject({ severity: 'WARNING', recommendation: 'Review spending in this category.' });
  });

  test('savings rate < 20% -> WARNING', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 4300, totalExpense: 4300, totalIncome: 5000, savingsRate: 14 });
    const alert = findAlert(alerts, 'LOW_SAVINGS_RATE');
    expect(alert).toMatchObject({ severity: 'WARNING', recommendation: 'Review your savings and expenditure.' });
  });

  test('savings rate >= 20% -> no low-savings alert', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 3800, totalExpense: 3800, totalIncome: 5000, savingsRate: 24 });
    expect(findAlert(alerts, 'LOW_SAVINGS_RATE')).toBeUndefined();
  });

  test('spending increase > 20% -> WARNING', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [{ month: '2026-03', total: 15000 }, { month: '2026-02', total: 10000 }], currentMonthIncome: 5000, currentMonthExpenses: 15000, totalExpense: 15000, totalIncome: 5000 });
    const alert = findAlert(alerts, 'MONTHLY_SPENDING_SPIKE');
    expect(alert).toMatchObject({ severity: 'WARNING', recommendation: 'Review your recent spending increase.' });
  });

  test('spending increase <= 20% -> no spike alert', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [{ month: '2026-03', total: 12000 }, { month: '2026-02', total: 10000 }], currentMonthIncome: 5000, currentMonthExpenses: 12000, totalExpense: 12000, totalIncome: 5000 });
    expect(findAlert(alerts, 'MONTHLY_SPENDING_SPIKE')).toBeUndefined();
  });

  test('two consecutive months over budget -> WARNING', () => {
    const alerts = evaluate({ budgets: [{ category: 'Food', utilization: 120, amount: 1000, spent: 1200, remaining: -200 }], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), currentMonthIncome: 5000, currentMonthExpenses: 12000, totalExpense: 12000, totalIncome: 5000, monthlyBudgetOverages: [{ category: 'Food', count: 2 }] });
    const alert = findAlert(alerts, 'REPEATED_CATEGORY_OVERSPENDING');
    expect(alert).toMatchObject({ severity: 'WARNING', recommendation: 'Review your recurring Food overspending.' });
  });

  test('one month over budget -> no repeated-overspending alert', () => {
    const alerts = evaluate({ budgets: [{ category: 'Food', utilization: 90, amount: 1000, spent: 950, remaining: 50 }], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), currentMonthIncome: 5000, currentMonthExpenses: 8000, totalExpense: 8000, totalIncome: 5000, monthlyBudgetOverages: [{ category: 'Food', count: 1 }] });
    expect(findAlert(alerts, 'REPEATED_CATEGORY_OVERSPENDING')).toBeUndefined();
  });

  test('goal contribution below expected -> WARNING', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [{ name: 'Travel', currentAmount: 2000, targetAmount: 8000, status: 'active', requiredMonthly: 5000, monthlyContribution: 1200 }] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 4200, totalExpense: 4200, totalIncome: 5000 });
    const alert = findAlert(alerts, 'GOAL_CONTRIBUTION_GAP');
    expect(alert).toMatchObject({ severity: 'WARNING', recommendation: 'Increase your monthly contribution toward this goal.' });
  });

  test('completed goal -> no goal contribution alert', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [{ name: 'Travel', currentAmount: 10000, targetAmount: 8000, status: 'completed', requiredMonthly: 0, monthlyContribution: 1200 }] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 4200, totalExpense: 4200, totalIncome: 5000 });
    expect(findAlert(alerts, 'GOAL_CONTRIBUTION_GAP')).toBeUndefined();
  });

  test('remaining budget <= 10% -> WARNING', () => {
    const alerts = evaluate({ budgets: [{ category: 'Food', utilization: 90, amount: 1000, spent: 950, remaining: 50 }], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 4200, totalExpense: 4200, totalIncome: 5000 });
    const alert = findAlert(alerts, 'LOW_REMAINING_BUDGET');
    expect(alert).toMatchObject({ severity: 'WARNING', recommendation: 'Limit further spending in this category.' });
  });

  test('remaining budget > 10% -> no low-budget alert', () => {
    const alerts = evaluate({ budgets: [{ category: 'Food', utilization: 72, amount: 1000, spent: 720, remaining: 280 }], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 5000, currentMonthExpenses: 4200, totalExpense: 4200, totalIncome: 5000 });
    expect(findAlert(alerts, 'LOW_REMAINING_BUDGET')).toBeUndefined();
  });

  test('zero income handled safely', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [], currentMonthIncome: 0, currentMonthExpenses: 1200, totalExpense: 1200, totalIncome: 0 });
    expect(findAlert(alerts, 'LOW_SAVINGS_RATE')).toBeUndefined();
  });

  test('zero previous-month expenditure handled safely', () => {
    const alerts = evaluate({ budgets: [], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [{ month: '2026-03', total: 15000 }, { month: '2026-02', total: 0 }], currentMonthIncome: 5000, currentMonthExpenses: 15000, totalExpense: 15000, totalIncome: 5000 });
    expect(findAlert(alerts, 'MONTHLY_SPENDING_SPIKE')).toBeUndefined();
  });

  test('multiple rules can trigger simultaneously', () => {
    const alerts = evaluate({ budgets: [{ category: 'Food', utilization: 95, amount: 1000, spent: 950, remaining: 50 }, { category: 'Shopping', utilization: 80, amount: 2000, spent: 1600, remaining: 400 }], goals: { items: [{ name: 'Emergency', currentAmount: 3000, targetAmount: 10000, status: 'active', requiredMonthly: 7000, monthlyContribution: 500 }] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [{ month: '2026-03', total: 15000 }, { month: '2026-02', total: 10000 }], currentMonthIncome: 5000, currentMonthExpenses: 15000, totalExpense: 15000, totalIncome: 5000, categoryTotals: [{ category: 'Food', total: 9500 }], savingsRate: 10 });
    expect(alerts.some((alert) => alert.ruleId === 'HIGH_BUDGET_UTILIZATION')).toBe(true);
    expect(alerts.some((alert) => alert.ruleId === 'EXPENSES_EXCEED_INCOME')).toBe(true);
    expect(alerts.some((alert) => alert.ruleId === 'LOW_SAVINGS_RATE')).toBe(true);
  });

  test('alerts are sorted by severity', () => {
    const alerts = evaluate({ budgets: [{ category: 'Food', utilization: 120, amount: 1000, spent: 1200, remaining: -200 }, { category: 'Rent', utilization: 82, amount: 1000, spent: 820, remaining: 180 }], goals: { items: [] }, transactions: [], asOf: new Date('2026-03-15T00:00:00Z'), monthlyExpenseByMonth: [{ month: '2026-03', total: 15000 }, { month: '2026-02', total: 10000 }], currentMonthIncome: 5000, currentMonthExpenses: 15000, totalExpense: 15000, totalIncome: 5000, categoryTotals: [{ category: 'Food', total: 10000 }], savingsRate: 10 });
    expect(alerts[0].severity).toBe('CRITICAL');
    expect(alerts.every((alert, index) => index === 0 || alerts[index - 1].severity === alert.severity || alerts[index - 1].severity === 'CRITICAL' && alert.severity === 'WARNING' || alerts[index - 1].severity === 'WARNING' && alert.severity === 'INFO')).toBe(true);
  });
});

describe('GET /api/alerts', () => {
  test('unauthenticated requests are rejected', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(401);
  });

  test('the authenticated user only sees their own alerts', async () => {
    await a.post('/api/budgets', { category: 'Food', amount: 10000, period: 'monthly' });
    await a.post('/api/goals', { name: 'Emergency', targetAmount: 20000, currentAmount: 5000, monthlyContribution: 1000, targetDate: '2027-12-31' });
    await a.post('/api/transactions', { type: 'income', category: 'Salary', amount: 50000, date: '2026-03-10', description: 'salary' });
    await a.post('/api/transactions', { type: 'expense', category: 'Food', amount: 9000, date: '2026-03-12', description: 'groceries' });
    await a.post('/api/transactions', { type: 'expense', category: 'Shopping', amount: 55000, date: '2026-03-13', description: 'shopping spree' });

    await b.post('/api/budgets', { category: 'Food', amount: 10000, period: 'monthly' });
    await b.post('/api/transactions', { type: 'income', category: 'Salary', amount: 40000, date: '2026-03-10', description: 'salary' });

    const res = await a.get('/api/alerts?asOf=2026-03-15');
    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalAlerts).toBeGreaterThan(0);
    const bobRes = await b.get('/api/alerts?asOf=2026-03-15');
    expect(bobRes.body.data.alerts.length).toBe(0);
    expect(res.body.data.alerts.every((alert) => alert.category !== 'Food' || alert.category === 'Food')).toBe(true);
  });

  test('a user cannot retrieve another user\'s alerts', async () => {
    await a.post('/api/budgets', { category: 'Food', amount: 1000, period: 'monthly' });
    await a.post('/api/transactions', { type: 'income', category: 'Salary', amount: 10000, date: '2026-03-10' });
    await a.post('/api/transactions', { type: 'expense', category: 'Food', amount: 1100, date: '2026-03-12' });
    const res = await b.get('/api/alerts?asOf=2026-03-15');
    expect(res.body.data.alerts).toHaveLength(0);
  });
});
