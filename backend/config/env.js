/**
 * Environment configuration.
 *
 * loadConfig() is a pure function of an env object, so it can be unit tested.
 * validateEnv() is called only by server.js (not by app.js), which means tests
 * can import the Express app without needing real secrets.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });

const PLACEHOLDER_PREFIX = 'change-me';

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const defaultPython = process.platform === 'win32' ? 'python' : 'python3';

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    // Raw value kept so validateEnv can report an invalid PORT instead of silently defaulting.
    rawPort: env.PORT,
    port: parseInt(env.PORT, 10) || 5000,
    mongoUri: env.MONGODB_URI || '',
    jwtSecret: env.JWT_SECRET || '',
    jwtExpiresIn: env.JWT_EXPIRES_IN || '2h',
    // bcrypt work factor: higher = slower to brute-force. 12 is a sensible default; tests use 4 for speed.
    rawBcryptRounds: env.BCRYPT_ROUNDS,
    bcryptRounds: parseInt(env.BCRYPT_ROUNDS, 10) || 12,
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5000,http://127.0.0.1:5000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    python: {
      bin: env.PYTHON_BIN || defaultPython,
      timeoutMs: parseInt(env.PYTHON_TIMEOUT_MS, 10) || 10000,
      scriptPath: path.join(__dirname, '../../python-analysis/analysis.py'),
    },
  };
}

/** Throws one Error listing every problem, so the developer can fix them all at once. */
function validateEnv(config) {
  const problems = [];

  if (!config.mongoUri) {
    problems.push('MONGODB_URI is not set');
  } else if (!/^mongodb(\+srv)?:\/\//.test(config.mongoUri)) {
    problems.push('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }

  if (!config.jwtSecret) {
    problems.push('JWT_SECRET is not set');
  } else if (config.jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters long');
  } else if (config.jwtSecret.toLowerCase().startsWith(PLACEHOLDER_PREFIX)) {
    problems.push('JWT_SECRET is still the placeholder value; generate a real secret');
  }

  if (config.rawPort !== undefined && config.rawPort !== '') {
    const port = Number(config.rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      problems.push('PORT must be an integer between 1 and 65535');
    }
  }

  if (config.rawBcryptRounds !== undefined && config.rawBcryptRounds !== '') {
    const rounds = Number(config.rawBcryptRounds);
    if (!Number.isInteger(rounds) || rounds < 4 || rounds > 15) {
      problems.push('BCRYPT_ROUNDS must be an integer between 4 and 15');
    } else if (config.isProduction && rounds < 10) {
      problems.push('BCRYPT_ROUNDS must be at least 10 in production');
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${problems.join('\n  - ')}\n` +
        'Copy .env.example to .env and fill in the values.'
    );
  }
}

const config = loadConfig();

module.exports = { config, loadConfig, validateEnv };
