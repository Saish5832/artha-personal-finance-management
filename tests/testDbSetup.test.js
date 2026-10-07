/**
 * Tests for the test infrastructure itself (helpers/testDb.js).
 * Guards the Jest + MongoDB-driver handshake problem and the isolation/cleanup guarantees.
 */
const mongoose = require('mongoose');
const User = require('../backend/models/User');
const {
  TEST_DB_PREFIX,
  makeTestDbName,
  buildConnectOptions,
  connectTestDb,
  clearTestDb,
  closeTestDb,
  getTestDbInfo,
} = require('./helpers/testDb');
const { startHandshakeCapture } = require('./helpers/handshakeCapture');

describe('driver handshake metadata under Jest (regression: "Missing required sub-document \'driver\'")', () => {
  test('the connect options make the driver send complete client metadata', async () => {
    const capture = await startHandshakeCapture();
    const connection = mongoose.createConnection();
    // The capture server never answers, so the connection attempt fails by design; we only want its handshake.
    connection.openUri(capture.uri, { ...buildConnectOptions('handshake_probe'), serverSelectionTimeoutMS: 1500 }).catch(() => {});

    try {
      const client = await capture.clientMetadata;
      // These are exactly the fields a strict MongoDB server requires / inspects.
      expect(client).toBeDefined();
      expect(client.driver).toBeDefined();
      expect(client.driver.name).toMatch(/^nodejs/);
      expect(client.driver.version).toEqual(expect.any(String));
      expect(client.driver.version.length).toBeGreaterThan(0);
      expect(client.platform).toEqual(expect.any(String));
      expect(client.os).toBeDefined();
      expect(client.os.type).toEqual(expect.any(String));
    } finally {
      await connection.close().catch(() => {});
      await capture.close();
    }
  });
});

describe('test database naming', () => {
  test('names are unique, prefixed, and within the MongoDB length limit', () => {
    const names = Array.from({ length: 200 }, makeTestDbName);
    expect(new Set(names).size).toBe(200);
    names.forEach((name) => {
      expect(name.startsWith(TEST_DB_PREFIX)).toBe(true);
      expect(name.length).toBeLessThanOrEqual(63);
      expect(name).toMatch(/^[A-Za-z0-9_]+$/); // safe on every platform, including Windows
    });
  });
});

describe('test database lifecycle (real MongoDB)', () => {
  beforeAll(connectTestDb, 180000);
  afterAll(closeTestDb); // also exercises "close twice is safe", because a test below closes first

  test('connects to a uniquely named artha_test_* database, never the real "artha" one', () => {
    expect(mongoose.connection.readyState).toBe(1);
    expect(mongoose.connection.name).toMatch(new RegExp(`^${TEST_DB_PREFIX}`));
    expect(mongoose.connection.name).not.toBe('artha');
    expect(getTestDbInfo().dbName).toBe(mongoose.connection.name);
  });

  test('indexes are initialized: the unique email index on users exists', async () => {
    const indexes = await User.collection.indexes();
    const emailIndex = indexes.find((i) => i.key && i.key.email === 1);
    expect(emailIndex).toBeDefined();
    expect(emailIndex.unique).toBe(true);
  });

  test('clearTestDb empties collections but keeps their indexes', async () => {
    await User.create({ name: 'Temp User', email: 'temp@example.com', passwordHash: 'x' });
    expect(await User.countDocuments()).toBe(1);
    await clearTestDb();
    expect(await User.countDocuments()).toBe(0);
    const indexes = await User.collection.indexes();
    expect(indexes.some((i) => i.key && i.key.email === 1 && i.unique)).toBe(true);
  });

  test('closeTestDb drops the test database, disconnects, and can safely be called again', async () => {
    const { uri, dbName } = getTestDbInfo();
    await User.create({ name: 'Temp User', email: 'temp2@example.com', passwordHash: 'x' });

    await closeTestDb();
    expect(mongoose.connection.readyState).toBe(0);
    expect(getTestDbInfo()).toEqual({ uri: null, dbName: null });

    // An independent connection must no longer find the database.
    const checker = await mongoose.createConnection(uri, buildConnectOptions('admin')).asPromise();
    try {
      const { databases } = await checker.db.admin().listDatabases();
      expect(databases.map((d) => d.name)).not.toContain(dbName);
    } finally {
      await checker.close();
    }

    await expect(closeTestDb()).resolves.toBeUndefined(); // idempotent
  });
});
