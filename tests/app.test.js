const request = require('supertest');
const createApp = require('../backend/app');

describe('Express app wiring', () => {
  const app = createApp();

  test('unknown /api route returns the standard JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({
      success: false,
      error: 'Not Found',
      message: 'Route GET /api/does-not-exist not found',
    });
  });

  test('unknown page returns plain-text 404, not JSON', async () => {
    const res = await request(app).get('/no-such-page');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/text/);
  });

  test('landing page is served at "/"', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('ARTHA');
    expect(res.text).toContain('Personal Finance Management System');
    expect(res.text).toContain('Track your money. Understand your spending. Reach your goals.');
  });

  test.each(['/css/variables.css', '/css/base.css', '/js/api.js', '/js/theme.js', '/js/utils.js', '/js/auth.js', '/pages/dashboard.html'])(
    'static asset %s is served', async (url) => {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
    }
  );

  test('sets security headers and hides X-Powered-By', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  test('CORS allows a listed origin and does not echo an unlisted one', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5000');

    const blocked = await request(app).get('/api/health').set('Origin', 'http://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
