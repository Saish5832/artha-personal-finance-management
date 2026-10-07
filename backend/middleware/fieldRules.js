/**
 * Reusable express-validator building blocks for the finance modules.
 *
 * Why so strict about types: request bodies and query strings can contain objects
 * (e.g. ?type[$ne]=x or { "category": { "$gt": "" } }). Requiring plain strings/numbers
 * means such values are rejected with 400 instead of reaching MongoDB as query operators.
 */
const { body, query } = require('express-validator');
const { MAX_AMOUNT } = require('../utils/money');

const MIN_DATE = new Date('2000-01-01T00:00:00Z');
const MAX_DATE = new Date('2100-01-01T00:00:00Z');

/** A positive/zero money amount: a finite number (or numeric string) with at most 2 decimals. */
function isMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
  if (typeof value === 'string') return /^\d+(\.\d{1,2})?$/.test(value.trim());
  return false;
}

function moneyBody(field, { label, min = 0.01, max = MAX_AMOUNT, required = true, defaultValue } = {}) {
  let chain = body(field);
  chain = required ? chain.exists({ values: 'null' }).withMessage(`${label} is required`).bail() : chain.optional({ values: 'null' });
  chain = chain
    .custom(isMoney).withMessage(`${label} must be a number with at most 2 decimal places`).bail()
    .customSanitizer((v) => Number(v))
    .custom((v) => v >= min).withMessage(min > 0 ? `${label} must be at least ${min}` : `${label} cannot be negative`).bail()
    .custom((v) => v <= max).withMessage(`${label} is too large`);
  if (defaultValue !== undefined) chain = chain.default(defaultValue);
  return chain;
}

function isoDate(chain, label) {
  return chain
    .isString().withMessage(`${label} must be a date`).bail()
    .isISO8601({ strict: true, strictSeparator: true }).withMessage(`${label} must be a valid date (YYYY-MM-DD)`).bail()
    .customSanitizer((v) => new Date(v))
    .custom((d) => d >= MIN_DATE && d < MAX_DATE).withMessage(`${label} is out of the supported range`);
}

const dateBody = (field, label, { required = true } = {}) =>
  isoDate(required ? body(field).exists({ values: 'null' }).withMessage(`${label} is required`).bail() : body(field).optional({ values: 'null' }), label);

/** Optional ?asOf=YYYY-MM-DD: "pretend today is this date" (used to view past budget periods, and by tests). */
const asOfQuery = () => isoDate(query('asOf').optional(), 'asOf');

const stringBody = (field, label, { min = 0, max, required = true } = {}) =>
  (required ? body(field).exists().withMessage(`${label} is required`).bail() : body(field).optional({ values: 'null' }))
    .isString().withMessage(`${label} must be text`).bail()
    .trim()
    .isLength({ min, max }).withMessage(`${label} must be ${min ? `between ${min} and ${max}` : `at most ${max}`} characters`);

module.exports = { isMoney, moneyBody, dateBody, asOfQuery, stringBody, isoDate };
