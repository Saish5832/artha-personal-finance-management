/** Regression API: user-scoped historical trends calculated through the Python bridge. */
const request = require('supertest');
const createApp = require('../backend/app');
const { connectTestDb, clearTestDb, closeTestDb } = require('./helpers/testDb');
const { registerUser, client } = require('./helpers/authHelper');

const app = createApp();
const AS_OF = '2026-05-15';
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

function monthTransactions(user, incomes, expenses) {
  return Promise.all(incomes.map((income, index) => {
    const month = `2026-0${index + 1}`;
    return Promise.all([
      user.post('/api/transactions', { type: 'income', category: 'Salary', amount: income, date: `${month}-05` }),
      user.post('/api/transactions', { type: 'expense', category: 'Food', amount: expenses[index], date: `${month}-10` }),
    ]);
  }));
}

describe('GET /api/regression', () => {
  test('requires authentication and validates the optional asOf date', async () => {
    expect((await request(app).get('/api/regression')).status).toBe(401);
    expect((await a.get('/api/regression?asOf=2026-02-30')).status).toBe(400);
  });

  test('returns both historical regressions with monthly data for the authenticated user only', async () => {
    await monthTransactions(a, [30000, 35000, 40000, 45000, 50000], [10000, 12000, 14000, 16000, 18000]);
    await monthTransactions(b, [100000, 100000, 100000, 100000, 100000], [90000, 80000, 70000, 60000, 50000]);

    const response = await a.get(`/api/regression?asOf=${AS_OF}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.asOf).toBe(AS_OF);
    expect(response.body.data.incomeSavings).toMatchObject({ status: 'ok', relationship: 'positive', monthsAnalyzed: 5 });
    expect(response.body.data.expenditureTrend).toMatchObject({ status: 'ok', trend: 'increasing', coefficient: 2000, monthsAnalyzed: 5 });
    expect(response.body.data.expenditureTrend.currentVsTrend).toMatchObject({ actual: 18000, trendValue: 18000, status: 'near_trend' });
    expect(response.body.data.expenditureTrend.monthlyData).toHaveLength(5);
    expect(JSON.stringify(response.body.data)).not.toContain('100000');
  });

  test('returns insufficient-data states instead of fabricated regression results', async () => {
    await monthTransactions(a, [30000, 35000], [10000, 12000]);
    const response = await a.get('/api/regression?asOf=2026-02-15');
    expect(response.status).toBe(200);
    expect(response.body.data.incomeSavings).toMatchObject({ status: 'insufficient_data', monthsAnalyzed: 2, coefficient: null, fittedValues: [] });
    expect(response.body.data.expenditureTrend).toMatchObject({ status: 'insufficient_data', monthsAnalyzed: 2, currentVsTrend: null });
  });

  test('classifies constant expenditure as stable and constant income as insufficient variation', async () => {
    await monthTransactions(a, [30000, 30000, 30000], [10000, 10000, 10000]);
    const response = await a.get('/api/regression?asOf=2026-03-15');
    expect(response.status).toBe(200);
    expect(response.body.data.expenditureTrend).toMatchObject({ status: 'ok', trend: 'stable', coefficient: 0, rSquared: 1 });
    expect(response.body.data.incomeSavings).toMatchObject({ status: 'insufficient_data', coefficient: null });
  });

  test('an empty account receives explicit insufficient-data results', async () => {
    const response = await a.get(`/api/regression?asOf=${AS_OF}`);
    expect(response.status).toBe(200);
    expect(response.body.data.incomeSavings.status).toBe('insufficient_data');
    expect(response.body.data.expenditureTrend.status).toBe('insufficient_data');
    expect(response.body.data.expenditureTrend.currentVsTrend).toBeNull();
    expect(response.body.data.expenditureTrend.monthlyData).toEqual([]);
  });
});