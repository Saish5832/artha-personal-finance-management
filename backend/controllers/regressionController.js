const { matchedData } = require('express-validator');
const service = require('../services/regressionService');
const asyncHandler = require('../utils/asyncHandler');

exports.get = asyncHandler(async (req, res) => {
  const { asOf } = matchedData(req, { locations: ['query'] });
  const data = await service.analyzeUser(req.user._id, asOf || new Date());
  res.json({ success: true, data });
});