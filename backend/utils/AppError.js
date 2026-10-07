/**
 * Operational error with an HTTP status. Controllers and services throw these;
 * the central errorHandler turns them into the consistent JSON error shape:
 *   { "success": false, "error": "Validation Error", "message": "..." }
 */
class AppError extends Error {
  /**
   * @param {number} statusCode HTTP status
   * @param {string} label      short error name shown in the "error" field
   * @param {string} message    safe, user-facing message
   * @param {object} [opts]
   * @param {object} [opts.fields] per-field validation messages (sent to client)
   * @param {*}      [opts.cause]  internal detail (logged on the server, never sent)
   */
  constructor(statusCode, label, message, { fields, cause } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.label = label;
    this.fields = fields;
    this.cause = cause;
    this.isOperational = true;
  }

  static badRequest(message, opts) { return new AppError(400, 'Bad Request', message, opts); }
  static validation(message, opts) { return new AppError(400, 'Validation Error', message, opts); }
  static unauthorized(message = 'Authentication required', opts) { return new AppError(401, 'Unauthorized', message, opts); }
  static forbidden(message = 'You do not have permission to do that', opts) { return new AppError(403, 'Forbidden', message, opts); }
  static notFound(message = 'Resource not found', opts) { return new AppError(404, 'Not Found', message, opts); }
  static conflict(message, opts) { return new AppError(409, 'Conflict', message, opts); }
  static unprocessable(message, opts) { return new AppError(422, 'Unprocessable Entity', message, opts); }
  static internal(message = 'Something went wrong on the server', opts) { return new AppError(500, 'Internal Server Error', message, opts); }
}

module.exports = AppError;
