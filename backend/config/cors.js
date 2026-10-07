/**
 * CORS allowlist. The frontend is served by this same Express app, so normal use
 * is same-origin and needs no CORS at all; the allowlist exists for development
 * setups (e.g. opening the frontend from another local port).
 */
const { config } = require('./env');

const corsOptions = {
  origin(origin, callback) {
    // No Origin header = same-origin request, curl, or server-to-server: allow.
    if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
    // Not allowed: omit CORS headers (the browser blocks it) without raising a server error.
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = corsOptions;
