const { loadConfig, validateEnv } = require('../backend/config/env');

const GOOD = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/artha',
  JWT_SECRET: 'a'.repeat(48),
};

describe('loadConfig', () => {
  test('applies defaults', () => {
    const c = loadConfig({});
    expect(c.port).toBe(5000);
    expect(c.jwtExpiresIn).toBe('2h');
    expect(c.python.timeoutMs).toBe(10000);
    expect(c.corsOrigins).toEqual(['http://localhost:5000', 'http://127.0.0.1:5000']);
    expect(c.nodeEnv).toBe('development');
  });

  test('reads overrides and parses the CORS list', () => {
    const c = loadConfig({ ...GOOD, PORT: '8080', JWT_EXPIRES_IN: '30m', PYTHON_BIN: 'py', CORS_ORIGINS: ' http://a.test , http://b.test ' });
    expect(c.port).toBe(8080);
    expect(c.jwtExpiresIn).toBe('30m');
    expect(c.python.bin).toBe('py');
    expect(c.corsOrigins).toEqual(['http://a.test', 'http://b.test']);
  });
});

describe('validateEnv', () => {
  test('accepts a valid configuration', () => {
    expect(() => validateEnv(loadConfig(GOOD))).not.toThrow();
  });

  test('reports every missing required variable at once', () => {
    expect(() => validateEnv(loadConfig({}))).toThrow(/MONGODB_URI is not set[\s\S]*JWT_SECRET is not set/);
  });

  test('rejects a non-MongoDB URI', () => {
    expect(() => validateEnv(loadConfig({ ...GOOD, MONGODB_URI: 'http://localhost' }))).toThrow(/must start with mongodb/);
  });

  test('rejects a short JWT secret', () => {
    expect(() => validateEnv(loadConfig({ ...GOOD, JWT_SECRET: 'short' }))).toThrow(/at least 32 characters/);
  });

  test('rejects the placeholder JWT secret', () => {
    expect(() => validateEnv(loadConfig({ ...GOOD, JWT_SECRET: 'change-me-' + 'x'.repeat(40) }))).toThrow(/placeholder/);
  });

  test.each(['abc', '0', '70000', '12.5'])('rejects invalid PORT %s', (port) => {
    expect(() => validateEnv(loadConfig({ ...GOOD, PORT: port }))).toThrow(/PORT must be/);
  });

  test.each(['abc', '3', '16', '12.5'])('rejects invalid BCRYPT_ROUNDS %s', (rounds) => {
    expect(() => validateEnv(loadConfig({ ...GOOD, BCRYPT_ROUNDS: rounds }))).toThrow(/BCRYPT_ROUNDS must be an integer between 4 and 15/);
  });

  test('requires BCRYPT_ROUNDS >= 10 in production', () => {
    expect(() => validateEnv(loadConfig({ ...GOOD, NODE_ENV: 'production', BCRYPT_ROUNDS: '4' }))).toThrow(/at least 10 in production/);
    expect(() => validateEnv(loadConfig({ ...GOOD, NODE_ENV: 'production', BCRYPT_ROUNDS: '12' }))).not.toThrow();
  });

  test('bcrypt rounds default to 12', () => {
    expect(loadConfig({}).bcryptRounds).toBe(12);
  });
});
