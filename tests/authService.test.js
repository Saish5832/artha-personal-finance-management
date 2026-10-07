// Unit tests for JWT helpers (no database needed).
const jwt = require('jsonwebtoken');
const { config } = require('../backend/config/env');
const authService = require('../backend/services/authService');

describe('signToken / verifyToken', () => {
  test('round trip: sub is the user id, expiry is 2 hours by default', () => {
    const token = authService.signToken('64b7f0f0f0f0f0f0f0f0f0f0');
    const payload = authService.verifyToken(token);
    expect(payload.sub).toBe('64b7f0f0f0f0f0f0f0f0f0f0');
    expect(payload.exp - payload.iat).toBe(2 * 60 * 60);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']); // nothing else is stored in the token
  });

  test('a tampered token is rejected with 401', () => {
    const token = authService.signToken('64b7f0f0f0f0f0f0f0f0f0f0');
    const tampered = token.slice(0, -3) + (token.endsWith('abc') ? 'xyz' : 'abc');
    expect(() => authService.verifyToken(tampered)).toThrow(expect.objectContaining({ statusCode: 401, message: 'Invalid authentication token' }));
  });

  test('a token signed with a different secret is rejected', () => {
    const forged = jwt.sign({}, 'some-other-secret-0123456789abcdef012345', { subject: 'x', expiresIn: '1h' });
    expect(() => authService.verifyToken(forged)).toThrow(expect.objectContaining({ statusCode: 401 }));
  });

  test('an expired token gets the "session expired" message', () => {
    const expired = jwt.sign({}, config.jwtSecret, { subject: 'x', expiresIn: -10 });
    expect(() => authService.verifyToken(expired)).toThrow(expect.objectContaining({ statusCode: 401, message: 'Your session has expired. Please log in again.' }));
  });

  test('only HS256 is accepted (a token using another algorithm is rejected)', () => {
    const hs512 = jwt.sign({}, config.jwtSecret, { subject: 'x', expiresIn: '1h', algorithm: 'HS512' });
    expect(() => authService.verifyToken(hs512)).toThrow(expect.objectContaining({ statusCode: 401 }));
  });

  test('a bare number for JWT_EXPIRES_IN means seconds, not milliseconds', () => {
    const original = config.jwtExpiresIn;
    try {
      config.jwtExpiresIn = '7200';
      expect(authService.expiresInValue()).toBe(7200);
      config.jwtExpiresIn = '30m';
      expect(authService.expiresInValue()).toBe('30m');
    } finally {
      config.jwtExpiresIn = original;
    }
  });
});
