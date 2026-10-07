/**
 * Authentication integration tests: real Express app + real MongoDB (see helpers/testDb.js).
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const createApp = require('../backend/app');
const User = require('../backend/models/User');
const { config } = require('../backend/config/env');
const { connectTestDb, clearTestDb, closeTestDb } = require('./helpers/testDb');

const app = createApp();
const VALID = { name: 'Asha Rao', email: 'asha@example.com', password: 'Sup3rSecret' };

const register = (body = VALID) => request(app).post('/api/auth/register').send(body);
const login = (body) => request(app).post('/api/auth/login').send(body);
const me = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

/** A response must never contain a password hash or the plaintext password. */
function expectNoSecrets(res, plaintext = VALID.password) {
  const text = JSON.stringify(res.body);
  expect(text).not.toMatch(/passwordHash/i);
  expect(text).not.toMatch(/\$2[aby]\$/); // bcrypt hash prefix
  expect(text).not.toContain(plaintext);
}

beforeAll(connectTestDb, 180000);
afterAll(closeTestDb);
beforeEach(clearTestDb);

describe('POST /api/auth/register', () => {
  test('creates the account: 201, user profile and a JWT, with no secrets', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({ name: 'Asha Rao', email: 'asha@example.com' });
    expect(res.body.data.user._id).toMatch(/^[0-9a-f]{24}$/);
    expect(res.body.data.user.createdAt).toBeDefined();
    expect(typeof res.body.data.token).toBe('string');
    expect(Object.keys(res.body.data.user).sort()).toEqual(['_id', 'createdAt', 'email', 'name', 'updatedAt']);
    expectNoSecrets(res);
  });

  test('the password is stored only as a bcrypt hash', async () => {
    await register();
    const raw = await mongoose.connection.db.collection('users').findOne({ email: VALID.email });
    expect(raw.passwordHash).toMatch(/^\$2[aby]\$04\$/); // bcrypt, cost 4 in tests
    expect(raw.passwordHash).not.toContain(VALID.password);
    expect(raw.password).toBeUndefined();
  });

  test('the JWT identifies the new user and expires in 2 hours', async () => {
    const res = await register();
    const payload = jwt.verify(res.body.data.token, config.jwtSecret);
    expect(payload.sub).toBe(res.body.data._id || res.body.data.user._id);
    expect(payload.exp - payload.iat).toBe(7200);
  });

  test('normalizes email (trim + lowercase) and trims the name', async () => {
    const res = await register({ name: '  Asha Rao  ', email: '  Asha@Example.COM ', password: VALID.password });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('asha@example.com');
    expect(res.body.data.user.name).toBe('Asha Rao');
  });

  test('duplicate email -> 409 with a field message, and no second account', async () => {
    await register();
    const res = await register({ ...VALID, name: 'Someone Else' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: 'Conflict', message: 'An account with this email already exists' });
    expect(res.body.fields.email).toBeDefined();
    expect(await User.countDocuments()).toBe(1);
  });

  test('duplicate email is detected case-insensitively', async () => {
    await register();
    const res = await register({ ...VALID, email: 'ASHA@EXAMPLE.COM' });
    expect(res.status).toBe(409);
    expect(await User.countDocuments()).toBe(1);
  });

  test('two simultaneous registrations of one email: exactly one wins (unique index)', async () => {
    const results = await Promise.all([register(), register(), register()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409]);
    expect(await User.countDocuments()).toBe(1);
  });

  describe('validation (400, nothing is created)', () => {
    const cases = [
      ['empty body', {}, ['name', 'email', 'password']],
      ['short name', { ...VALID, name: 'A' }, ['name']],
      ['name too long', { ...VALID, name: 'x'.repeat(61) }, ['name']],
      ['invalid email', { ...VALID, email: 'not-an-email' }, ['email']],
      ['short password', { ...VALID, password: 'Ab1' }, ['password']],
      ['password without a number', { ...VALID, password: 'OnlyLetters' }, ['password']],
      ['password without a letter', { ...VALID, password: '12345678' }, ['password']],
      ['password over 72 bytes', { ...VALID, password: 'a1'.repeat(37) }, ['password']],
      ['name is a number', { ...VALID, name: 12345 }, ['name']],
      ['email is an object (NoSQL operator)', { ...VALID, email: { $ne: null } }, ['email']],
      ['password is an array', { ...VALID, password: ['Sup3rSecret'] }, ['password']],
    ];

    test.each(cases)('%s', async (label, body, badFields) => {
      const res = await register(body);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Validation Error');
      expect(Object.keys(res.body.fields).sort()).toEqual([...badFields].sort());
      expect(await User.countDocuments()).toBe(0);
    });

    test('request with no body at all', async () => {
      const res = await request(app).post('/api/auth/register');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    test('malformed JSON', async () => {
      const res = await request(app).post('/api/auth/register').set('Content-Type', 'application/json').send('{"name":');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });
  });

  test('extra fields cannot be mass-assigned (passwordHash, _id, role are ignored)', async () => {
    const forgedId = new mongoose.Types.ObjectId().toString();
    const res = await register({ ...VALID, passwordHash: 'attacker-chosen', _id: forgedId, role: 'admin', isAdmin: true });
    expect(res.status).toBe(201);
    expect(res.body.data.user._id).not.toBe(forgedId);
    expect(res.body.data.user.role).toBeUndefined();
    // The real password still works; the attacker-chosen "hash" was never used.
    expect((await login({ email: VALID.email, password: VALID.password })).status).toBe(200);
  });

  test('a name containing HTML is stored as plain text (escaping happens at render time)', async () => {
    const res = await register({ ...VALID, name: '<img src=x onerror=alert(1)>' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.name).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => { await register(); });

  test('correct credentials -> 200, user and token, no secrets', async () => {
    const res = await login({ email: VALID.email, password: VALID.password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(VALID.email);
    expect(typeof res.body.data.token).toBe('string');
    expectNoSecrets(res);
  });

  test('the token returned by login works on a protected route', async () => {
    const res = await login({ email: VALID.email, password: VALID.password });
    const profile = await me(res.body.data.token);
    expect(profile.status).toBe(200);
    expect(profile.body.data.user.email).toBe(VALID.email);
  });

  test('email is matched case-insensitively', async () => {
    const res = await login({ email: '  ASHA@Example.com ', password: VALID.password });
    expect(res.status).toBe(200);
  });

  test('incorrect password -> 401 with a generic message', async () => {
    const res = await login({ email: VALID.email, password: 'WrongPass1' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Unauthorized', message: 'Invalid email or password' });
    expect(res.body.data).toBeUndefined();
  });

  test('unknown email -> 401 with the IDENTICAL response (no account enumeration)', async () => {
    const wrongPassword = await login({ email: VALID.email, password: 'WrongPass1' });
    const unknownEmail = await login({ email: 'nobody@example.com', password: 'WrongPass1' });
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  test('a password differing only by case is rejected', async () => {
    const res = await login({ email: VALID.email, password: VALID.password.toLowerCase() });
    expect(res.status).toBe(401);
  });

  test.each([
    ['missing email', { password: VALID.password }, 'email'],
    ['missing password', { email: VALID.email }, 'password'],
    ['empty password', { email: VALID.email, password: '' }, 'password'],
    ['invalid email format', { email: 'nope', password: VALID.password }, 'email'],
  ])('validation: %s -> 400', async (label, body, field) => {
    const res = await login(body);
    expect(res.status).toBe(400);
    expect(res.body.fields[field]).toBeDefined();
  });

  test('NoSQL injection in email ({"$ne": null}) is rejected, not executed', async () => {
    const res = await login({ email: { $ne: null }, password: VALID.password });
    expect(res.status).toBe(400);
    expect(res.body.data).toBeUndefined();
  });

  test('NoSQL injection in password ({"$ne": ""}) is rejected', async () => {
    const res = await login({ email: VALID.email, password: { $ne: '' } });
    expect(res.status).toBe(400);
  });

  test('a stale/invalid Authorization header does not affect login', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Authorization', 'Bearer garbage')
      .send({ email: VALID.email, password: VALID.password });
    expect(res.status).toBe(200);
  });
});

describe('protected route: GET /api/auth/me', () => {
  let token;
  beforeEach(async () => { token = (await register()).body.data.token; });

  test('valid token -> 200 with the caller\'s own profile and no secrets', async () => {
    const res = await me(token);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ name: VALID.name, email: VALID.email });
    expectNoSecrets(res);
  });

  test('missing token -> 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Unauthorized', message: 'Authentication required. Please log in.' });
  });

  test.each([
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
    ['scheme with no token', 'Bearer'],
    ['token with extra parts', 'Bearer a b'],
    ['no scheme', 'justatoken'],
  ])('malformed Authorization header (%s) -> 401', async (label, header) => {
    const res = await request(app).get('/api/auth/me').set('Authorization', header);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('garbage token -> 401 invalid token', async () => {
    const res = await me('this.is.not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid authentication token');
  });

  test('tampered token (signature changed) -> 401', async () => {
    const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    const res = await me(tampered);
    expect(res.status).toBe(401);
  });

  test('token signed with the wrong secret -> 401', async () => {
    const sub = jwt.decode(token).sub;
    const forged = jwt.sign({}, 'attacker-secret-0123456789abcdef0123456789', { subject: sub, expiresIn: '1h' });
    const res = await me(forged);
    expect(res.status).toBe(401);
  });

  test('"alg: none" unsigned token -> 401', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const sub = jwt.decode(token).sub;
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
    const res = await me(unsigned);
    expect(res.status).toBe(401);
  });

  test('expired token -> 401 "session expired"', async () => {
    const sub = jwt.decode(token).sub;
    const expired = jwt.sign({}, config.jwtSecret, { subject: sub, expiresIn: -60 });
    const res = await me(expired);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Your session has expired. Please log in again.');
  });

  test('valid token for a deleted account -> 401', async () => {
    await User.deleteMany({});
    const res = await me(token);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('The account for this token no longer exists');
  });

  test('token whose subject is not an ObjectId -> 401 (not a 500)', async () => {
    const bad = jwt.sign({}, config.jwtSecret, { subject: 'not-an-object-id', expiresIn: '1h' });
    const res = await me(bad);
    expect(res.status).toBe(401);
  });
});

describe('user-specific authorization', () => {
  test('each user only ever sees their own profile; a client-supplied userId is ignored', async () => {
    const a = (await register({ name: 'Alice A', email: 'alice@example.com', password: 'Passw0rdA' })).body.data;
    const b = (await register({ name: 'Bobby B', email: 'bob@example.com', password: 'Passw0rdB' })).body.data;

    expect((await me(a.token)).body.data.user.email).toBe('alice@example.com');
    expect((await me(b.token)).body.data.user.email).toBe('bob@example.com');

    // Bob tries to impersonate Alice by supplying her id in every place a client could.
    const spoof = await request(app)
      .get(`/api/auth/me?userId=${a.user._id}&user=${a.user._id}`)
      .set('Authorization', `Bearer ${b.token}`)
      .set('X-User-Id', a.user._id)
      .send({ userId: a.user._id });
    expect(spoof.status).toBe(200);
    expect(spoof.body.data.user._id).toBe(b.user._id);
    expect(spoof.body.data.user.email).toBe('bob@example.com');
  });
});

describe('POST /api/auth/logout', () => {
  test('succeeds with a valid token', async () => {
    const token = (await register()).body.data.token;
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('succeeds with no token or an expired one (client can always log out)', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(200);
    const expired = jwt.sign({}, config.jwtSecret, { subject: 'x', expiresIn: -60 });
    expect((await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${expired}`)).status).toBe(200);
  });

  test('is stateless: the token itself stays valid until it expires (documented trade-off)', async () => {
    const token = (await register()).body.data.token;
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect((await me(token)).status).toBe(200);
  });
});

describe('auth response headers', () => {
  test('auth responses are not cacheable', async () => {
    const res = await register();
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
