const request = require('supertest');

jest.mock('../backend/config/db', () => ({
  getDbState: jest.fn(),
  pingDB: jest.fn(),
  connectDB: jest.fn(),
  disconnectDB: jest.fn(),
}));
const { getDbState, pingDB } = require('../backend/config/db');
const createApp = require('../backend/app');

describe('GET /api/health', () => {
  const app = createApp();

  beforeEach(() => { jest.clearAllMocks(); });

  test('returns 200 and status ok when the database is connected', async () => {
    getDbState.mockReturnValue('connected');
    pingDB.mockResolvedValue(true);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database.state).toBe('connected');
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
    expect(new Date(res.body.data.timestamp).toString()).not.toBe('Invalid Date');
  });

  test('returns 503 and status degraded when the database is disconnected', async () => {
    getDbState.mockReturnValue('disconnected');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.database.state).toBe('disconnected');
    expect(pingDB).not.toHaveBeenCalled(); // no point pinging a connection that is not open
  });

  test('returns 503 "unreachable" when the driver says connected but the live ping fails', async () => {
    getDbState.mockReturnValue('connected');
    pingDB.mockResolvedValue(false);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.database.state).toBe('unreachable');
  });
});
