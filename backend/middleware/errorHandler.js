/**
 * Centralized error handler: every failure becomes the same JSON shape and
 * internal details (stack traces, driver messages) never reach the client.
 */
const { config } = require('../config/env');
const AppError = require('../utils/AppError');

const DB_UNAVAILABLE_ERRORS = [
  'MongooseServerSelectionError',
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
];

function normalizeError(err) {
  if (err instanceof AppError) {
    return { status: err.statusCode, label: err.label, message: err.message, fields: err.fields };
  }
  // express.json() failures
  if (err.type === 'entity.parse.failed') {
    return { status: 400, label: 'Bad Request', message: 'Request body contains invalid JSON' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, label: 'Payload Too Large', message: 'Request body is too large' };
  }
  // Safety net: a JWT error that reaches here (normally authService converts these itself)
  if (err.name === 'TokenExpiredError') {
    return { status: 401, label: 'Unauthorized', message: 'Your session has expired. Please log in again.' };
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    return { status: 401, label: 'Unauthorized', message: 'Invalid authentication token' };
  }
  // Mongoose schema validation
  if (err.name === 'ValidationError' && err.errors) {
    const fields = {};
    Object.values(err.errors).forEach((e) => { fields[e.path] = e.message; });
    return { status: 400, label: 'Validation Error', message: Object.values(fields).join('; '), fields };
  }
  // Mongoose: malformed ObjectId etc.
  if (err.name === 'CastError') {
    return { status: 400, label: 'Bad Request', message: `Invalid value for "${err.path}"` };
  }
  // MongoDB duplicate key (unique index)
  if (err.code === 11000) {
    const keys = Object.keys(err.keyValue || {}).join(', ') || 'field';
    return { status: 409, label: 'Conflict', message: `A record with this ${keys} already exists` };
  }
  if (DB_UNAVAILABLE_ERRORS.includes(err.name)) {
    return { status: 503, label: 'Database Unavailable', message: 'The database is currently unavailable' };
  }
  return { status: 500, label: 'Internal Server Error', message: 'Something went wrong on the server' };
}

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const { status, label, message, fields } = normalizeError(err);

  if (status >= 500 && !config.isTest) {
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${status}`, err.cause || err);
  }

  const body = { success: false, error: label, message };
  if (fields) body.fields = fields;
  return res.status(status).json(body);
};
