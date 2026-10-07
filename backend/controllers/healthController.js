const { getDbState, pingDB } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/health
 * 200 when the API and database are up; 503 when the database is not usable,
 * so uptime monitors and the frontend can tell "degraded" from "healthy".
 * database.state is one of: connected | unreachable | disconnected | connecting | disconnecting
 * ("unreachable" = the driver thinks it is connected but a live ping failed).
 */
exports.getHealth = asyncHandler(async (req, res) => {
  let dbState = getDbState();
  if (dbState === 'connected' && !(await pingDB())) dbState = 'unreachable';
  const healthy = dbState === 'connected';

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: { state: dbState },
    },
  });
});
