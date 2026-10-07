const express = require('express');
const request = require('supertest');
const errorHandler = require('../backend/middleware/errorHandler');
const AppError = require('../backend/utils/AppError');
const asyncHandler = require('../backend/utils/asyncHandler');

// A tiny app whose routes each fail in a different way.
function buildApp() {
  const app = express();
  app.use(express.json({ limit: '1kb' }));

  app.post('/echo', (req, res) => res.json(req.body));
  app.get('/app-error', () => { throw AppError.validation('Amount must be greater than zero', { fields: { amount: 'must be > 0' } }); });
  app.get('/forbidden', () => { throw AppError.forbidden(); });
  app.get('/unprocessable', () => { throw AppError.unprocessable('Need at least 6 months of data'); });
  app.get('/async-fail', asyncHandler(async () => { throw AppError.notFound('Transaction not found'); }));
  app.get('/mongoose-validation', () => {
    const e = new Error('Transaction validation failed');
    e.name = 'ValidationError';
    e.errors = { amount: { path: 'amount', message: 'Amount must be positive' }, type: { path: 'type', message: 'Type is required' } };
    throw e;
  });
  app.get('/cast-error', () => { const e = new Error('x'); e.name = 'CastError'; e.path = '_id'; throw e; });
  app.get('/duplicate', () => { const e = new Error('dup'); e.code = 11000; e.keyValue = { email: 'a@b.com' }; throw e; });
  app.get('/db-down', () => { const e = new Error('connect ECONNREFUSED'); e.name = 'MongooseServerSelectionError'; throw e; });
  app.get('/jwt-expired', () => { const e = new Error('jwt expired'); e.name = 'TokenExpiredError'; throw e; });
  app.get('/jwt-bad', () => { const e = new Error('invalid signature'); e.name = 'JsonWebTokenError'; throw e; });
  app.get('/boom', () => { throw new Error('secret internal detail: password=hunter2'); });

  app.use(errorHandler);
  return app;
}

describe('centralized error handler', () => {
  const app = buildApp();

  test('AppError -> its status, label, message and fields', async () => {
    const res = await request(app).get('/app-error');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: 'Validation Error',
      message: 'Amount must be greater than zero',
      fields: { amount: 'must be > 0' },
    });
  });

  test('403 forbidden', async () => {
    const res = await request(app).get('/forbidden');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  test('422 unprocessable (used for insufficient regression data)', async () => {
    const res = await request(app).get('/unprocessable');
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Need at least 6 months of data');
  });

  test('errors thrown inside async handlers reach the handler', async () => {
    const res = await request(app).get('/async-fail');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });

  test('malformed JSON body -> 400 JSON, not an HTML stack trace', async () => {
    const res = await request(app).post('/echo').set('Content-Type', 'application/json').send('{"amount": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Bad Request', message: 'Request body contains invalid JSON' });
  });

  test('oversized body -> 413', async () => {
    const res = await request(app).post('/echo').send({ blob: 'x'.repeat(5000) });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Payload Too Large');
  });

  test('Mongoose ValidationError -> 400 with per-field messages', async () => {
    const res = await request(app).get('/mongoose-validation');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect(res.body.fields).toEqual({ amount: 'Amount must be positive', type: 'Type is required' });
  });

  test('Mongoose CastError (bad ObjectId) -> 400', async () => {
    const res = await request(app).get('/cast-error');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid value for "_id"');
  });

  test('duplicate key -> 409', async () => {
    const res = await request(app).get('/duplicate');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('A record with this email already exists');
  });

  test('database unreachable -> 503', async () => {
    const res = await request(app).get('/db-down');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Database Unavailable');
  });

  test('JWT errors that reach the handler -> 401 with safe messages', async () => {
    const expired = await request(app).get('/jwt-expired');
    expect(expired.status).toBe(401);
    expect(expired.body.message).toBe('Your session has expired. Please log in again.');
    const bad = await request(app).get('/jwt-bad');
    expect(bad.status).toBe(401);
    expect(bad.body.message).toBe('Invalid authentication token'); // not "invalid signature"
  });

  test('unexpected error -> generic 500 that leaks nothing', async () => {
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'Internal Server Error', message: 'Something went wrong on the server' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });
});
