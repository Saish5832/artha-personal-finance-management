// Runs before every test file: test mode, a test-only JWT secret, and a cheap bcrypt cost.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-0123456789abcdef0123456789abcdef';
process.env.BCRYPT_ROUNDS = '4';
