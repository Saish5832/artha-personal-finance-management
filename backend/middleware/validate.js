/**
 * Runs after an express-validator rule chain: if anything failed, respond with the
 * standard 400 "Validation Error" (with per-field messages) instead of reaching the controller.
 */
const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

module.exports = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const fields = {};
  result.array({ onlyFirstError: true }).forEach((e) => { fields[e.path] = e.msg; });
  return next(AppError.validation(Object.values(fields).join('; '), { fields }));
};
