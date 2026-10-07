/** Analytics API: authenticated EDA runs only over the caller's persisted records. */
const request = require('supertest');
const createApp = require('../backend/app');
const { connectTestDb, clearTestDb, closeTestDb } = require('./helpers/testDb');
const { registerUser, client } = require('./helpers/authHelper');

const app = createApp();
const AS_OF = '2026-02-15';
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

const transaction = (user, type, category, amount, date) => user.post('/api/transactions', {
  type, category, amount, date, description: `${category} activity`,
});

describe('GET /api/analytics', () => {
  test('requires authentication and validates asOf', async () => {
    expect((await request(app).get('/api/analytics')).status).toBe(401);
    expect((await a.get('/api/analytics?asOf=not-a-date')).status).toBe(400);
  });

  test('returns EDA structure from only the authenticated user and calculated budget actuals', async () => {
    await transaction(a, 'income', 'Salary', 1000, '2026-01-10');
    await transaction(a, 'expense', 'Food', 300, '2026-01-11');
    await transaction(a, 'income', 'Salary', 1200, '2026-02-10');
    await transaction(a, 'expense', 'Food', 400, '2026-02-11');
    await transaction(b, 'income', 'Salary', 100000, '2026-02-12');
    await transaction(b, 'expense', 'Food', 90000, '2026-02-13');
    await a.post('/api/budgets', { category: 'Food', amount: 500, period: 'monthly' });
    await b.post('/api/budgets', { category: 'Food', amount: 1, period: 'monthly' });

    const response = await a.get(`/api/analytics?asOf=${AS_OF}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.overview).toEqual({
      totalIncome: 2200,
      totalExpenditure: 700,
      totalSavings: 1500,
      savingsRate: 68.18,
      transactionCount: 4,
    });
    expect(data.preprocessing).toMatchObject({ transactionsReceived: 4, transactionsUsed: 4, transactionsDropped: 0, budgetsUsed: 1 });
    expect(data.univariate.expenditure).toMatchObject({ count: 2, average: 350, median: 350, minimum: 300, maximum: 400 });
    expect(data.bivariate.budgetVsActual).toEqual([{
      category: 'Food', period: 'monthly', budget: 500, actual: 400, variance: 100, utilizationPercent: 80,
    }]);
    expect(data.monthly.map((month) => month.month)).toEqual(['2026-01', '2026-02']);
    expect(data.monthly[1]).toMatchObject({ income: 1200, expenditure: 400, savings: 800, expenseChange: 100 });
    expect(data.multivariate.categoryRelationships.find((row) => row.category === 'Food')).toMatchObject({
      income: 0, expenditure: 700, savings: -700,
    });
    expect(JSON.stringify(data)).not.toContain('100000');
  });

  test('returns graceful empty analysis when the user has no transactions or budgets', async () => {
    const response = await a.get(`/api/analytics?asOf=${AS_OF}`);
    expect(response.status).toBe(200);
    expect(response.body.data.overview).toEqual({
      totalIncome: 0, totalExpenditure: 0, totalSavings: 0, savingsRate: null, transactionCount: 0,
    });
    expect(response.body.data.monthly).toEqual([]);
    expect(response.body.data.univariate).toEqual({
      expenditure: { count: 0, average: null, median: null, minimum: null, maximum: null, distribution: { edges: [], counts: [] } },
      categorySpending: [],
    });
    expect(response.body.data.bivariate.budgetVsActual).toEqual([]);
    expect(response.body.data.multivariate.categoryRelationships).toEqual([]);
  });

  test('handles users with only income and no budget records', async () => {
    await transaction(a, 'income', 'Salary', 2500, '2026-02-01');
    const response = await a.get(`/api/analytics?asOf=${AS_OF}`);
    expect(response.status).toBe(200);
    expect(response.body.data.overview).toMatchObject({ totalIncome: 2500, totalExpenditure: 0, totalSavings: 2500, savingsRate: 100 });
    expect(response.body.data.univariate.expenditure.average).toBeNull();
    expect(response.body.data.bivariate.budgetVsActual).toEqual([]);
  });
});