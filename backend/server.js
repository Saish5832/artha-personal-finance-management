/** Entry point: validate config, connect MongoDB, check Python, start listening. */
const { config, validateEnv } = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const { runPython } = require('./services/pythonBridge');
const createApp = require('./app');

async function checkPython() {
  try {
    const info = await runPython('env_check');
    console.log(`[python] OK: Python ${info.python}, pandas ${info.pandas}, numpy ${info.numpy}`);
  } catch (err) {
    // Not fatal: the app still works; only Analytics and Regression need Python.
    console.warn(`[python] WARNING: analysis engine unavailable (${err.cause || err.message}).`);
    console.warn('[python] Analytics and Regression will return errors until this is fixed.');
    console.warn('[python] Run: pip install -r python-analysis/requirements.txt (and check PYTHON_BIN in .env)');
  }
}

async function start() {
  try {
    validateEnv(config);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  try {
    await connectDB(config.mongoUri);
    console.log('[db] Connected to MongoDB');
  } catch (err) {
    console.error(`[db] Could not connect to MongoDB: ${err.message}`);
    console.error('[db] Is MongoDB running, and is MONGODB_URI correct?');
    process.exit(1);
  }

  const server = createApp().listen(config.port, () => {
    console.log(`[server] Artha running at http://localhost:${config.port} (${config.nodeEnv})`);
    checkPython(); // runs in the background; does not delay startup
  });

  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE'
      ? `[server] Port ${config.port} is already in use. Change PORT in .env.`
      : `[server] ${err.message}`);
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
