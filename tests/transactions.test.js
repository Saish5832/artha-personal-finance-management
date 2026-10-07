/** Transactions API: CRUD, validation, filtering/search/pagination, and ownership. Real Express app + real MongoDB. */
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

const TX = { type: 'expense', category: 'Food', amount: 250.5, date: '2026-03-10', description: 'Lunch with team' };
const create = (c, body = TX) => c.post('/api/transactions', body);

describe('authentication', () => {
  test.each([['get', '/api/transactions'], ['post', '/api/transactions'], ['get', '/api/transactions/categories']])(
    '%s %s without a token -> 401', async (method, url) => {
      const request = require('supertest');
      const res = await request(app)[method](url).send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

  test('a garbage token -> 401', async () => {
    const res = await client(app, 'not.a.jwt').get('/api/transactions');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/transactions', () => {
  test('creates a transaction owned by the caller', async () => {
    const res = await create(a);
    expect(res.status).toBe(201);
    const tx = res.body.data.transaction;
    expect(tx).toMatchObject({ type: 'expense', category: 'Food', amount: 250.5, description: 'Lunch with team', userId: alice.id });
    expect(tx.date).toBe('2026-03-10T00:00:00.000Z');
    expect(tx._id).toMatch(/^[0-9a-f]{24}$/);
  });

  test('a userId sent in the body is ignored: the owner is always the token holder', async () => {
    const res = await create(a, { ...TX, userId: bob.id });
    expect(res.status).toBe(201);
    expect(res.body.data.transaction.userId).toBe(alice.id);
    expect((await b.get('/api/transactions')).body.data.items).toHaveLength(0);
  });

  test('description is optional and defaults to empty', async () => {
    const { description, ...rest } = TX;
    expect((await create(a, rest)).body.data.transaction.description).toBe('');
  });

  test('accepts a numeric string amount', async () => {
    expect((await create(a, { ...TX, amount: '99.99' })).body.data.transaction.amount).toBe(99.99);
  });

  test('income transactions use income categories', async () => {
    const res = await create(a, { type: 'income', category: 'Salary', amount: 50000, date: '2026-03-01' });
    expect(res.status).toBe(201);
  });

  test.each([
    ['missing type', { ...TX, type: undefined }, 'type'],
    ['unknown type', { ...TX, type: 'transfer' }, 'type'],
    ['category from the wrong type', { ...TX, category: 'Salary' }, 'category'],
    ['unknown category', { ...TX, category: 'Nonsense' }, 'category'],
    ['zero amount', { ...TX, amount: 0 }, 'amount'],
    ['negative amount', { ...TX, amount: -5 }, 'amount'],
    ['three decimals', { ...TX, amount: 1.234 }, 'amount'],
    ['non-numeric amount', { ...TX, amount: 'abc' }, 'amount'],
    ['absurdly large amount', { ...TX, amount: 1e12 }, 'amount'],
    ['missing date', { ...TX, date: undefined }, 'date'],
    ['invalid date', { ...TX, date: '2026-13-45' }, 'date'],
    ['date out of range', { ...TX, date: '1980-01-01' }, 'date'],
    ['description too long', { ...TX, description: 'x'.repeat(201) }, 'description'],
    ['object injected as category', { ...TX, category: { $ne: null } }, 'category'],
    ['object injected as type', { ...TX, type: { $gt: '' } }, 'type'],
    ['array as amount', { ...TX, amount: [1, 2] }, 'amount'],
  ])('rejects %s with 400 and a field message', async (_name, body, field) => {
    const res = await create(a, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect(res.body.fields[field]).toBeDefined();
  });

  test('nothing is saved when validation fails', async () => {
    await create(a, { ...TX, amount: -1 });
    expect(await mongoose.connection.db.collection('transactions').countDocuments()).toBe(0);
  });
});

describe('GET /api/transactions/categories', () => {
  test('returns the fixed income and expense category lists', async () => {
    const res = await a.get('/api/transactions/categories');
    expect(res.status).toBe(200);
    expect(res.body.data.expense).toContain('Food');
    expect(res.body.data.income).toContain('Salary');
  });
});

describe('GET/PUT/DELETE /api/transactions/:id', () => {
  test('reads one transaction', async () => {
    const id = (await create(a)).body.data.transaction._id;
    const res = await a.get(`/api/transactions/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.transaction._id).toBe(id);
  });

  test('updates a transaction (PUT replaces the editable fields)', async () => {
    const id = (await create(a)).body.data.transaction._id;
    const res = await a.put(`/api/transactions/${id}`, { type: 'expense', category: 'Transport', amount: 80, date: '2026-03-11' });
    expect(res.status).toBe(200);
    expect(res.body.data.transaction).toMatchObject({ category: 'Transport', amount: 80, description: '' });
    expect(res.body.data.transaction.date).toBe('2026-03-11T00:00:00.000Z');
  });

  test('changing the type requires a matching category', async () => {
    const id = (await create(a)).body.data.transaction._id;
    const res = await a.put(`/api/transactions/${id}`, { ...TX, type: 'income' }); // Food is not an income category
    expect(res.status).toBe(400);
    const ok = await a.put(`/api/transactions/${id}`, { type: 'income', category: 'Gift', amount: 10, date: '2026-03-11' });
    expect(ok.status).toBe(200);
  });

  test('update cannot move a transaction to another user via userId', async () => {
    const id = (await create(a)).body.data.transaction._id;
    const res = await a.put(`/api/transactions/${id}`, { ...TX, userId: bob.id });
    expect(res.body.data.transaction.userId).toBe(alice.id);
  });

  test('deletes a transaction', async () => {
    const id = (await create(a)).body.data.transaction._id;
    expect((await a.del(`/api/transactions/${id}`)).status).toBe(200);
    expect((await a.get(`/api/transactions/${id}`)).status).toBe(404);
  });

  test('a malformed id -> 400, an unknown id -> 404', async () => {
    expect((await a.get('/api/transactions/123')).status).toBe(400);
    expect((await a.get(`/api/transactions/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
    expect((await a.del(`/api/transactions/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });
});

describe('ownership: users only access their own transactions', () => {
  let aliceTxId;
  beforeEach(async () => { aliceTxId = (await create(a)).body.data.transaction._id; });

  test("Bob cannot read Alice's transaction (404, same as not found)", async () => {
    const res = await b.get(`/api/transactions/${aliceTxId}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Lunch');
  });

  test("Bob cannot update Alice's transaction, and it is unchanged", async () => {
    const res = await b.put(`/api/transactions/${aliceTxId}`, { ...TX, amount: 1, description: 'hacked' });
    expect(res.status).toBe(404);
    const after = (await a.get(`/api/transactions/${aliceTxId}`)).body.data.transaction;
    expect(after).toMatchObject({ amount: 250.5, description: 'Lunch with team' });
  });

  test("Bob cannot delete Alice's transaction, and it still exists", async () => {
    expect((await b.del(`/api/transactions/${aliceTxId}`)).status).toBe(404);
    expect((await a.get(`/api/transactions/${aliceTxId}`)).status).toBe(200);
  });

  test("Bob's list and totals never include Alice's data", async () => {
    await create(b, { ...TX, amount: 10, description: 'bob only' });
    const res = await b.get('/api/transactions');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].description).toBe('bob only');
    expect(res.body.data.totals.expense).toBe(10);
  });
});

describe('GET /api/transactions: filter, search, sort, paginate', () => {
  beforeEach(async () => {
    const rows = [
      { type: 'income', category: 'Salary', amount: 50000, date: '2026-03-01', description: 'March salary' },
      { type: 'expense', category: 'Food', amount: 300, date: '2026-03-05', description: 'Groceries' },
      { type: 'expense', category: 'Food', amount: 450, date: '2026-03-20', description: 'Dinner out' },
      { type: 'expense', category: 'Transport', amount: 120, date: '2026-03-21', description: 'Metro card' },
      { type: 'expense', category: 'Rent', amount: 15000, date: '2026-04-01', description: 'April rent' },
    ];
    for (const r of rows) await create(a, r);
  });
  const list = (qs = '') => a.get(`/api/transactions${qs}`);

  test('default order is newest first, with totals for the whole set', async () => {
    const res = await list();
    expect(res.body.data.items.map((t) => t.description)).toEqual(['April rent', 'Metro card', 'Dinner out', 'Groceries', 'March salary']);
    expect(res.body.data.totals).toEqual({ income: 50000, expense: 15870, net: 34130 });
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 5, pages: 1 });
  });

  test('filter by type', async () => {
    const res = await list('?type=income');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.totals).toEqual({ income: 50000, expense: 0, net: 50000 });
  });

  test('filter by category', async () => {
    const res = await list('?category=Food');
    expect(res.body.data.items.map((t) => t.amount).sort()).toEqual([300, 450]);
    expect(res.body.data.totals.expense).toBe(750);
  });

  test('filter by date range (the "to" day is inclusive)', async () => {
    const res = await list('?from=2026-03-05&to=2026-03-20');
    expect(res.body.data.items.map((t) => t.description).sort()).toEqual(['Dinner out', 'Groceries']);
  });

  test('filter by amount range', async () => {
    const res = await list('?minAmount=200&maxAmount=500&type=expense');
    expect(res.body.data.items).toHaveLength(2);
  });

  test('search matches description or category, case-insensitively', async () => {
    expect((await list('?q=GROCER')).body.data.items).toHaveLength(1);
    expect((await list('?q=transport')).body.data.items).toHaveLength(1);
  });

  test('search text is not interpreted as a regular expression', async () => {
    expect((await list('?q=.*')).body.data.items).toHaveLength(0);
    expect((await list('?q=(')).status).toBe(200);
  });

  test('sort by amount ascending', async () => {
    const res = await list('?sortBy=amount&order=asc');
    expect(res.body.data.items.map((t) => t.amount)).toEqual([120, 300, 450, 15000, 50000]);
  });

  test('pagination returns pages, but totals still cover every match', async () => {
    const p2 = await list('?limit=2&page=2');
    expect(p2.body.data.items).toHaveLength(2);
    expect(p2.body.data.pagination).toEqual({ page: 2, limit: 2, total: 5, pages: 3 });
    expect(p2.body.data.totals.income).toBe(50000);
  });

  test('filters combine (AND)', async () => {
    const res = await list('?category=Food&from=2026-03-10');
    expect(res.body.data.items.map((t) => t.description)).toEqual(['Dinner out']);
  });

  test.each([['?type=bogus'], ['?sortBy=password'], ['?page=0'], ['?limit=1000'], ['?from=yesterday'], ['?minAmount=abc']])(
    'invalid query %s -> 400', async (qs) => {
      expect((await list(qs)).status).toBe(400);
    });

  test.each([['?type[$ne]=income'], ['?category[$ne]=Food'], ['?q[$ne]=x'], ['?amount[$gt]=100000']])(
    'MongoDB operators in the query string (%s) have no effect: all 5 rows are still returned', async (qs) => {
      const res = await list(qs);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(5);
    });
});
