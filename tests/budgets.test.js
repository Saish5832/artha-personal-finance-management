/** Budgets API: CRUD, validation, calculated spending/utilization, duplicate protection, ownership. */
const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../backend/app');
const { connectTestDb, clearTestDb, closeTestDb } = require('./helpers/testDb');
const { registerUser, client } = require('./helpers/authHelper');

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

const AS_OF = '?asOf=2026-03-15';
const BUDGET = { category: 'Food', amount: 5000, period: 'monthly' };
const spend = (c, category, amount, date, type = 'expense') => c.post('/api/transactions', { type, category, amount, date, description: 'x' });
const createBudget = (c, body = BUDGET) => c.post('/api/budgets', body);

describe('authentication', () => {
  test('all budget routes require a token', async () => {
    expect((await request(app).get('/api/budgets')).status).toBe(401);
    expect((await request(app).post('/api/budgets').send(BUDGET)).status).toBe(401);
    expect((await request(app).delete(`/api/budgets/${new mongoose.Types.ObjectId()}`)).status).toBe(401);
  });
});

describe('POST /api/budgets', () => {
  test('creates a budget owned by the caller, with spending calculated from transactions', async () => {
    const res = await createBudget(a);
    expect(res.status).toBe(201);
    expect(res.body.data.budget).toMatchObject({ category: 'Food', amount: 5000, period: 'monthly', spent: 0, utilization: 0, status: 'ok', overBudget: false });
  });

  test('period defaults to monthly', async () => {
    const res = await createBudget(a, { category: 'Rent', amount: 15000 });
    expect(res.body.data.budget.period).toBe('monthly');
  });

  test('a userId in the body is ignored', async () => {
    await createBudget(a, { ...BUDGET, userId: bob.id });
    expect((await b.get('/api/budgets')).body.data.items).toHaveLength(0);
    expect((await a.get('/api/budgets')).body.data.items).toHaveLength(1);
  });

  test('a second budget for the same category and period -> 409; a different period is allowed', async () => {
    await createBudget(a);
    const dup = await createBudget(a);
    expect(dup.status).toBe(409);
    expect(dup.body.fields.category).toBeDefined();
    expect((await createBudget(a, { ...BUDGET, period: 'yearly', amount: 60000 })).status).toBe(201);
  });

  test('two users can each have a Food budget', async () => {
    expect((await createBudget(a)).status).toBe(201);
    expect((await createBudget(b)).status).toBe(201);
  });

  test.each([
    ['income category', { ...BUDGET, category: 'Salary' }, 'category'],
    ['unknown category', { ...BUDGET, category: 'Nope' }, 'category'],
    ['missing amount', { category: 'Food' }, 'amount'],
    ['zero amount', { ...BUDGET, amount: 0 }, 'amount'],
    ['negative amount', { ...BUDGET, amount: -1 }, 'amount'],
    ['bad period', { ...BUDGET, period: 'daily' }, 'period'],
    ['object as category', { ...BUDGET, category: { $ne: 1 } }, 'category'],
  ])('rejects %s with 400', async (_n, body, field) => {
    const res = await createBudget(a, body);
    expect(res.status).toBe(400);
    expect(res.body.fields[field]).toBeDefined();
  });
});

describe('spending, utilization and status (calculated from real transactions)', () => {
  beforeEach(async () => { await createBudget(a); }); // Food 5000 monthly
  const get = async (qs = AS_OF) => (await a.get(`/api/budgets${qs}`)).body.data.items[0];

  test('only EXPENSES of the matching category inside the period count', async () => {
    await spend(a, 'Food', 1000, '2026-03-02');
    await spend(a, 'Food', 500, '2026-03-31');
    await spend(a, 'Food', 9999, '2026-02-28');      // previous month: excluded
    await spend(a, 'Food', 9999, '2026-04-01');      // next month: excluded
    await spend(a, 'Transport', 700, '2026-03-10');  // other category: excluded
    await spend(a, 'Gift', 400, '2026-03-10', 'income'); // income: excluded
    const b1 = await get();
    expect(b1).toMatchObject({ spent: 1500, remaining: 3500, utilization: 30, status: 'ok' });
  });

  test('utilization = spent / budget x 100, and the status follows the 80/90/100 thresholds', async () => {
    await spend(a, 'Food', 4100, '2026-03-02');           // 82%
    expect(await get()).toMatchObject({ utilization: 82, status: 'warning', overBudget: false });
    await spend(a, 'Food', 500, '2026-03-03');            // 92%
    expect(await get()).toMatchObject({ utilization: 92, status: 'critical' });
    await spend(a, 'Food', 400, '2026-03-04');            // 100% exactly: spending >= budget
    expect(await get()).toMatchObject({ utilization: 100, status: 'over', overBudget: true, remaining: 0 });
    await spend(a, 'Food', 1000, '2026-03-05');           // 120%
    const over = await get();
    expect(over).toMatchObject({ utilization: 120, remaining: -1000, status: 'over' });
    expect(over.alert).toBeTruthy();
  });

  test('changing a transaction changes the budget (nothing is cached)', async () => {
    const id = (await spend(a, 'Food', 1000, '2026-03-02')).body.data.transaction._id;
    expect((await get()).spent).toBe(1000);
    await a.put(`/api/transactions/${id}`, { type: 'expense', category: 'Food', amount: 2500, date: '2026-03-02' });
    expect((await get()).spent).toBe(2500);
    await a.del(`/api/transactions/${id}`);
    expect((await get()).spent).toBe(0);
  });

  test('weekly and yearly periods use their own windows', async () => {
    await createBudget(a, { category: 'Food', amount: 1000, period: 'weekly' });
    await createBudget(a, { category: 'Food', amount: 100000, period: 'yearly' });
    await spend(a, 'Food', 200, '2026-03-16'); // Monday of the week containing 2026-03-15? No: 15 Mar is a Sunday, so its week is 9-15 Mar.
    await spend(a, 'Food', 300, '2026-03-12');
    const items = (await a.get(`/api/budgets${AS_OF}`)).body.data.items;
    const weekly = items.find((x) => x.period === 'weekly');
    const yearly = items.find((x) => x.period === 'yearly');
    expect(weekly.spent).toBe(300);   // 12 Mar is in 9-15 Mar; 16 Mar is next week
    expect(yearly.spent).toBe(500);
  });

  test('the list summary counts over-budget and near-limit budgets', async () => {
    await createBudget(a, { category: 'Rent', amount: 1000 });
    await spend(a, 'Food', 5200, '2026-03-02');  // over
    await spend(a, 'Rent', 850, '2026-03-02');   // warning
    const res = await a.get(`/api/budgets${AS_OF}`);
    expect(res.body.data.summary).toEqual({ count: 2, overBudget: 1, warning: 1 });
  });

  test('the asOf parameter is validated', async () => {
    expect((await a.get('/api/budgets?asOf=not-a-date')).status).toBe(400);
  });
});

describe('GET/PUT/DELETE /api/budgets/:id', () => {
  test('reads, updates and deletes a budget', async () => {
    const id = (await createBudget(a)).body.data.budget._id;
    expect((await a.get(`/api/budgets/${id}`)).body.data.budget.amount).toBe(5000);

    const upd = await a.put(`/api/budgets/${id}`, { category: 'Food', amount: 7000, period: 'monthly' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.budget.amount).toBe(7000);

    expect((await a.del(`/api/budgets/${id}`)).status).toBe(200);
    expect((await a.get(`/api/budgets/${id}`)).status).toBe(404);
  });

  test('updating into an existing category+period combination -> 409', async () => {
    await createBudget(a);
    const id = (await createBudget(a, { category: 'Rent', amount: 100 })).body.data.budget._id;
    expect((await a.put(`/api/budgets/${id}`, { category: 'Food', amount: 100, period: 'monthly' })).status).toBe(409);
  });

  test('malformed id -> 400, unknown id -> 404', async () => {
    expect((await a.get('/api/budgets/abc')).status).toBe(400);
    expect((await a.get(`/api/budgets/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });
});

describe('ownership', () => {
  let id;
  beforeEach(async () => { id = (await createBudget(a)).body.data.budget._id; });

  test("Bob cannot read, update or delete Alice's budget", async () => {
    expect((await b.get(`/api/budgets/${id}`)).status).toBe(404);
    expect((await b.put(`/api/budgets/${id}`, { category: 'Food', amount: 1, period: 'monthly' })).status).toBe(404);
    expect((await b.del(`/api/budgets/${id}`)).status).toBe(404);
    expect((await a.get(`/api/budgets/${id}`)).body.data.budget.amount).toBe(5000);
  });

  test("a budget never counts another user's spending", async () => {
    await spend(b, 'Food', 4000, '2026-03-02');
    const item = (await a.get(`/api/budgets${AS_OF}`)).body.data.items[0];
    expect(item.spent).toBe(0);
  });
});
