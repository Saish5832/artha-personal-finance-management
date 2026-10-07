/**
 * Real-MongoDB test helper (no mocking of the database).
 *
 * WHICH SERVER IS USED
 *   1. TEST_MONGODB_URI, if set (process environment or the project's .env file). Use this to run the
 *      tests against a MongoDB you already have, e.g. the local Windows service:
 *          TEST_MONGODB_URI=mongodb://127.0.0.1:27017
 *   2. Otherwise an in-memory MongoDB from mongodb-memory-server (downloads a MongoDB binary on first
 *      use, so the first run needs internet). This is the default for CI / a fresh checkout.
 *
 * ISOLATION
 *   Every test file gets its own database named artha_test_<pid>_<time>_<random>, which is dropped when the
 *   file finishes. The real "artha" database is never touched: the drop is refused unless the connected
 *   database name starts with "artha_test_".
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');

// Lets TEST_MONGODB_URI live in .env (handy on Windows, where inline VAR=value syntax does not work).
// dotenv never overrides variables that are already set in the environment.
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });

const TEST_DB_PREFIX = 'artha_test_';
const MODELS_DIR = path.join(__dirname, '../../backend/models');

let memoryServer = null;
let currentUri = null;
let currentDbName = null;

function makeTestDbName() {
  const random = Math.random().toString(36).slice(2, 8);
  return `${TEST_DB_PREFIX}${process.pid}_${Date.now()}_${random}`; // well under MongoDB's 63-character limit
}

/**
 * Options for mongoose.connect() in tests.
 *
 * runtimeAdapters: { os }  -- REQUIRED under Jest. The MongoDB driver (7.x) loads the "os" module with a
 * dynamic import(), which Jest's CommonJS sandbox does not support. When that import fails the driver
 * silently falls back to an EMPTY client-metadata document in its connection handshake. A lenient server
 * accepts that; a strict one (MongoDB 9.x, and the binaries mongodb-memory-server downloads) rejects it with
 * "Missing required sub-document 'driver' in the client metadata document". Handing the driver the os module
 * directly avoids the dynamic import. Plain Node (the real app) is not affected, so server code is unchanged.
 */
function buildConnectOptions(dbName) {
  return {
    dbName,
    serverSelectionTimeoutMS: 10000,
    runtimeAdapters: { os },
  };
}

/** Register every model so that init() below builds ALL indexes, including those of future phases. */
function loadAllModels() {
  fs.readdirSync(MODELS_DIR)
    .filter((file) => file.endsWith('.js'))
    .forEach((file) => require(path.join(MODELS_DIR, file)));
}

async function resolveServerUri() {
  const external = process.env.TEST_MONGODB_URI;
  if (external) {
    if (!/^mongodb(\+srv)?:\/\//.test(external)) {
      throw new Error('TEST_MONGODB_URI must start with mongodb:// or mongodb+srv://');
    }
    return external;
  }
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    return memoryServer.getUri();
  } catch (err) {
    throw new Error(
      'Could not start mongodb-memory-server (it downloads a MongoDB binary on first use and needs internet access).\n' +
        'Either fix that, or run the tests against a MongoDB you already have by setting\n' +
        '  TEST_MONGODB_URI=mongodb://127.0.0.1:27017\n' +
        `Original error: ${err.message}`
    );
  }
}

async function connectTestDb() {
  if (mongoose.connection.readyState !== 0) {
    throw new Error('connectTestDb(): mongoose is already connected; call closeTestDb() first');
  }
  try {
    currentUri = await resolveServerUri();
    currentDbName = makeTestDbName();
    await mongoose.connect(currentUri, buildConnectOptions(currentDbName));
    loadAllModels();
    // Build unique/other indexes now so no test depends on index-creation timing.
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  } catch (err) {
    // Setup failed halfway: release everything so Jest does not hang on an open handle.
    await closeTestDb().catch(() => {});
    throw err;
  }
}

/** Where the current test database lives (used by tests that need a second, independent connection). */
function getTestDbInfo() {
  return { uri: currentUri, dbName: currentDbName };
}

async function clearTestDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

/** Drops the test database, disconnects, stops the in-memory server. Safe to call more than once. */
async function closeTestDb() {
  try {
    const isOurTestDb =
      mongoose.connection.readyState === 1 &&
      currentDbName !== null &&
      currentDbName.startsWith(TEST_DB_PREFIX) &&
      mongoose.connection.name === currentDbName;
    if (isOurTestDb) await mongoose.connection.dropDatabase();
  } finally {
    await mongoose.disconnect().catch(() => {});
    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
    }
    currentUri = null;
    currentDbName = null;
  }
}

module.exports = {
  TEST_DB_PREFIX,
  makeTestDbName,
  buildConnectOptions,
  connectTestDb,
  clearTestDb,
  closeTestDb,
  getTestDbInfo,
};
