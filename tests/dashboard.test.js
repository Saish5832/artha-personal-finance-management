/** Dashboard API: aggregated metrics and chart data stay scoped to the authenticated user. */
const request = require('supertest');
const createApp = require('../backend/app');
const { connectTestDb, clearTestDb, closeTestDb } = require('./helpers/testDb');
const { registerUser, client } = require('./helpers/authHelper');

const app = createApp();
const AS_OF = '2026-06-15';
let alice;
let bob;
let a;
let b;

beforeAll(connectTestDb, 180000);
afterAll(closeTestDb);
beforeEach(async () => {
  await clearTestDb();
  alice = await registerUser(app, 'Alice');
  bob = await registerUser(app, 'Bob');
  a = client(app, alice.token);
  b = client(app, bob.token);
});

const transaction = (user, type, category, amount, date, description) => user.post('/api/transactions', {
  type, category, amount, date, description,
});

describe('GET /api/dashboard', () => {
  test('serves the local Chart.js bundle from the same origin', async () => {
    const response = await request(app).get('/vendor/chart.umd.js');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
    expect(response.text).toContain('Chart.js');
  });

  test('requires authentication and validates asOf', async () => {
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
    expect((await a.get('/api/dashboard?asOf=not-a-date')).status).toBe(400);
  });

  test('returns isolated totals, recent transactions, budgets, goals and chart data', async () => {
    await transaction(a, 'income', 'Salary', 5000, '2026-05-03', 'May salary');
    await transaction(a, 'expense', 'Food', 1000, '2026-05-10', 'May groceries');
    await transaction(a, 'expense', 'Food', 1500, '2026-06-10', 'June groceries');
    await transaction(a, 'expense', 'Transport', 500, '2026-06-12', 'Train');
    await transaction(b, 'income', 'Salary', 100000, '2026-06-13', 'Private income');
    await transaction(b, 'expense', 'Food', 99000, '2026-06-14', 'Private expense');
    await a.post('/api/budgets', { category: 'Food', amount: 2000, period: 'monthly' });
    await a.post('/api/budgets', { category: 'Rent', amount: 100, period: 'monthly' });
    await b.post('/api/budgets', { category: 'Food', amount: 1, period: 'monthly' });
    await a.post('/api/goals', { name: 'Emergency fund', targetAmount: 1000, currentAmount: 200 });
    await b.post('/api/goals', { name: 'Private goal', targetAmount: 1000 });

    const response = await a.get(`/api/dashboard?asOf=${AS_OF}`);
    expect(response.status).toBe(200);
    const { summary, recentTransactions, charts } = response.body.data;

    expect(summary).toMatchObject({
      totalIncome: 5000,
      totalExpenses: 3000,
      netSavings: 2000,
      savingsRate: 40,
      budgetUtilization: 71.43,
      activeGoals: 1,
      transactionCount: 4,
      highestSpendingCategory: { category: 'Food', amount: 2500 },
      overBudgetCount: 0,
      monthlyExpenseChange: { amount: 1000, percent: 100, current: 2000, previous: 1000 },
      financialHealth: { status: 'steady', title: 'Positive cash flow' },
    });
    expect(recentTransactions).toHaveLength(4);
    expect(recentTransactions[0]).toMatchObject({ description: 'Train', category: 'Transport', type: 'expense', amount: 500 });
    expect(recentTransactions.some((item) => item.description.startsWith('Private'))).toBe(false);
    expect(charts.monthlyIncomeExpense).toMatchObject({
      labels: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
      income: [0, 0, 0, 0, 5000, 0],
      expenses: [0, 0, 0, 0, 1000, 2000],
    });
    expect(charts.monthlyExpenseTrend.expenses).toEqual([0, 0, 0, 0, 1000, 2000]);
    expect(charts.expenseByCategory).toEqual({ labels: ['Food', 'Transport'], values: [2500, 500] });
    expect(charts.budgetVsActual).toMatchObject({ labels: ['Food (monthly)', 'Rent (monthly)'], budget: [2000, 100], actual: [1500, 0] });
    expect(charts.savingsTrend.values).toEqual([0, 0, 0, 0, 4000, -2000]);
  });

  test('returns stable zero-valued metrics and chart series for an empty account', async () => {
    const response = await a.get(`/api/dashboard?asOf=${AS_OF}`);
    expect(response.status).toBe(200);
    expect(response.body.data.summary).toMatchObject({
      totalIncome: 0,
      totalExpenses: 0,
      netSavings: 0,
      savingsRate: null,
      budgetUtilization: 0,
      activeGoals: 0,
      transactionCount: 0,
      highestSpendingCategory: null,
      overBudgetCount: 0,
      monthlyExpenseChange: { amount: 0, percent: null, current: 0, previous: 0 },
      financialHealth: { status: 'no_data', title: 'No transaction history' },
    });
    expect(response.body.data.recentTransactions).toEqual([]);
    expect(response.body.data.charts.monthlyIncomeExpense.income).toEqual([0, 0, 0, 0, 0, 0]);
    expect(response.body.data.charts.monthlyExpenseTrend.expenses).toEqual([0, 0, 0, 0, 0, 0]);
    expect(response.body.data.charts.expenseByCategory).toEqual({ labels: [], values: [] });
    expect(response.body.data.charts.budgetVsActual).toEqual({ labels: [], budget: [], actual: [] });
    expect(response.body.data.charts.savingsTrend.values).toEqual([0, 0, 0, 0, 0, 0]);
  });
});