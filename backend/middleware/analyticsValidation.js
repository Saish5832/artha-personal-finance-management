const { query } = require('express-validator');
const { isoDate } = require('./fieldRules');

const asOfQuery = isoDate(query('asOf').optional(), 'asOf');

module.exports = { asOfQuery };