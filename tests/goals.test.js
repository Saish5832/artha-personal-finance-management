/** Goals API: CRUD, validation, calculated fields, contributions, ownership. */
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

const GOAL = { name: 'Emergency fund', targetAmount: 100000, currentAmount: 25000, monthlyContribution: 5000 };
const createGoal = (c, body = GOAL) => c.post('/api/goals', body);

describe('authentication', () => {
  test('all goal routes require a token', async () => {
    expect((await request(app).get('/api/goals')).status).toBe(401);
    expect((await request(app).post('/api/goals').send(GOAL)).status).toBe(401);
    expect((await request(app).post(`/api/goals/${new mongoose.Types.ObjectId()}/contributions`).send({ amount: 5 })).status).toBe(401);
  });
});

describe('POST /api/goals', () => {
  test('creates a goal with calculated remaining, months and progress', async () => {
    const res = await createGoal(a);
    expect(res.status).toBe(201);
    expect(res.body.data.goal).toMatchObject({
      name: 'Emergency fund', targetAmount: 100000, currentAmount: 25000, monthlyContribution: 5000,
      remaining: 75000, estimatedMonths: 15, progress: 25, status: 'active', onTrack: null,
    });
  });

  test('only name and target are required; the rest default sensibly', async () => {
    const res = await createGoal(a, { name: 'Trip', targetAmount: 30000 });
    expect(res.status).toBe(201);
    expect(res.body.data.goal).toMatchObject({ currentAmount: 0, monthlyContribution: 0, estimatedMonths: null, targetDate: null });
  });

  test('with a target date the response includes required monthly amount and gap', async () => {
    const next = new Date(); next.setUTCFullYear(next.getUTCFullYear() + 1);
    const res = await createGoal(a, { ...GOAL, targetDate: next.toISOString().slice(0, 10) });
    const g = res.body.data.goal;
    expect(g.monthsLeft).toBeGreaterThanOrEqual(12);
    expect(g.requiredMonthly).toBeGreaterThan(0);
    expect(typeof g.onTrack).toBe('boolean');
  });

  test('a goal already fully funded is completed', async () => {
    const res = await createGoal(a, { name: 'Done', targetAmount: 1000, currentAmount: 1000 });
    expect(res.body.data.goal).toMatchObject({ status: 'completed', remaining: 0, estimatedMonths: 0, progress: 100 });
  });

  test('userId in the body is ignored', async () => {
    await createGoal(a, { ...GOAL, userId: bob.id });
    expect((await b.get('/api/goals')).body.data.items).toHaveLength(0);
  });

  test.each([
    ['missing name', { ...GOAL, name: undefined }, 'name'],
    ['one-letter name', { ...GOAL, name: 'x' }, 'name'],
    ['name too long', { ...GOAL, name: 'x'.repeat(81) }, 'name'],
    ['object as name', { ...GOAL, name: { $ne: '' } }, 'name'],
    ['missing target', { ...GOAL, targetAmount: undefined }, 'targetAmount'],
    ['zero target', { ...GOAL, targetAmount: 0 }, 'targetAmount'],
    ['negative current', { ...GOAL, currentAmount: -1 }, 'currentAmount'],
    ['negative monthly', { ...GOAL, monthlyContribution: -1 }, 'monthlyContribution'],
    ['text amount', { ...GOAL, targetAmount: 'lots' }, 'targetAmount'],
    ['bad target date', { ...GOAL, targetDate: 'next year' }, 'targetDate'],
  ])('rejects %s with 400', async (_n, body, field) => {
    const res = await createGoal(a, body);
    expect(res.status).toBe(400);
    expect(res.body.fields[field]).toBeDefined();
  });
});

describe('GET /api/goals', () => {
  test('lists the caller\'s goals, newest first, with a summary', async () => {
    await createGoal(a, { name: 'First', targetAmount: 1000, currentAmount: 1000 });
    await createGoal(a, { name: 'Second', targetAmount: 5000 });
    const res = await a.get('/api/goals');
    expect(res.body.data.items.map((g) => g.name)).toEqual(['Second', 'First']);
    expect(res.body.data.summary).toEqual({ count: 2, active: 1, completed: 1 });
  });
});

describe('GET/PUT/DELETE /api/goals/:id', () => {
  test('reads, updates and deletes', async () => {
    const id = (await createGoal(a)).body.data.goal._id;
    expect((await a.get(`/api/goals/${id}`)).body.data.goal.name).toBe('Emergency fund');

    const upd = await a.put(`/api/goals/${id}`, { name: 'Bigger fund', targetAmount: 200000, currentAmount: 25000, monthlyContribution: 10000 });
    expect(upd.status).toBe(200);
    expect(upd.body.data.goal).toMatchObject({ name: 'Bigger fund', remaining: 175000, estimatedMonths: 18 });

    expect((await a.del(`/api/goals/${id}`)).status).toBe(200);
    expect((await a.get(`/api/goals/${id}`)).status).toBe(404);
  });

  test('PUT can clear the target date', async () => {
    const id = (await createGoal(a, { ...GOAL, targetDate: '2030-01-01' })).body.data.goal._id;
    const res = await a.put(`/api/goals/${id}`, GOAL);
    expect(res.body.data.goal.targetDate).toBeNull();
  });

  test('malformed id -> 400, unknown id -> 404', async () => {
    expect((await a.get('/api/goals/zzz')).status).toBe(400);
    expect((await a.get(`/api/goals/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });
});

describe('POST /api/goals/:id/contributions', () => {
  test('adds to the current amount and recalculates', async () => {
    const id = (await createGoal(a)).body.data.goal._id;
    const res = await a.post(`/api/goals/${id}/contributions`, { amount: 10000.5 });
    expect(res.status).toBe(200);
    expect(res.body.data.goal).toMatchObject({ currentAmount: 35000.5, remaining: 64999.5, estimatedMonths: 13 });
  });

  test('a contribution that reaches the target completes the goal', async () => {
    const id = (await createGoal(a)).body.data.goal._id;
    const res = await a.post(`/api/goals/${id}/contributions`, { amount: 75000 });
    expect(res.body.data.goal.status).toBe('completed');
  });

  test.each([[0], [-5], ['abc'], [null], [1.234]])('rejects contribution %p', async (amount) => {
    const id = (await createGoal(a)).body.data.goal._id;
    expect((await a.post(`/api/goals/${id}/contributions`, { amount })).status).toBe(400);
  });
});

describe('ownership', () => {
  let id;
  beforeEach(async () => { id = (await createGoal(a)).body.data.goal._id; });

  test("Bob cannot read, update, contribute to or delete Alice's goal", async () => {
    expect((await b.get(`/api/goals/${id}`)).status).toBe(404);
    expect((await b.put(`/api/goals/${id}`, { ...GOAL, name: 'hacked' })).status).toBe(404);
    expect((await b.post(`/api/goals/${id}/contributions`, { amount: 100 })).status).toBe(404);
    expect((await b.del(`/api/goals/${id}`)).status).toBe(404);
    const after = (await a.get(`/api/goals/${id}`)).body.data.goal;
    expect(after).toMatchObject({ name: 'Emergency fund', currentAmount: 25000 });
  });

  test("Bob's list is empty", async () => {
    expect((await b.get('/api/goals')).body.data.items).toHaveLength(0);
  });
});
