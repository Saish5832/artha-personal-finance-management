const { matchedData } = require('express-validator');
const service = require('../services/budgetService');
const asyncHandler = require('../utils/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const { asOf, period } = matchedData(req, { locations: ['query'] });
  res.json({ success: true, data: await service.list(req.user._id, { asOf, period }) });
});

exports.get = asyncHandler(async (req, res) => {
  const { asOf } = matchedData(req, { locations: ['query'] });
  res.json({ success: true, data: { budget: await service.getById(req.user._id, req.params.id, asOf) } });
});

exports.create = asyncHandler(async (req, res) => {
  const budget = await service.create(req.user._id, matchedData(req, { locations: ['body'] }));
  res.status(201).json({ success: true, data: { budget } });
});

exports.update = asyncHandler(async (req, res) => {
  const budget = await service.update(req.user._id, req.params.id, matchedData(req, { locations: ['body'] }));
  res.json({ success: true, data: { budget } });
});

exports.remove = asyncHandler(async (req, res) => {
  await service.remove(req.user._id, req.params.id);
  res.json({ success: true, message: 'Budget deleted' });
});
