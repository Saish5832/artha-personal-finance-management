/** MongoDB connection management (Mongoose). */
const mongoose = require('mongoose');

// mongoose.connection.readyState: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting
const STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

function getDbState() {
  return STATES[mongoose.connection.readyState] || 'unknown';
}

async function connectDB(uri) {
  mongoose.set('strictQuery', true);
  // Fail within 5s if MongoDB is unreachable instead of hanging for 30s.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

/**
 * Active liveness check. readyState alone can be stale for ~10s after the server
 * dies (the driver only notices on its next heartbeat), so we send a real ping,
 * capped at timeoutMs so a dead database cannot hang the health endpoint.
 */
async function pingDB(timeoutMs = 2000) {
  if (mongoose.connection.readyState !== 1) return false;
  let timer;
  try {
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('ping timeout')), timeoutMs); }),
    ]);
    return true;
  } catch (err) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB, getDbState, pingDB };
