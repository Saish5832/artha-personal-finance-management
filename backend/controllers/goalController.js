const { matchedData } = require('express-validator');
const service = require('../services/goalService');
const asyncHandler = require('../utils/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const { asOf } = matchedData(req, { locations: ['query'] });
  res.json({ success: true, data: await service.list(req.user._id, asOf) });
});

exports.get = asyncHandler(async (req, res) => {
  const { asOf } = matchedData(req, { locations: ['query'] });
  res.json({ success: true, data: { goal: await service.getById(req.user._id, req.params.id, asOf) } });
});

exports.create = asyncHandler(async (req, res) => {
  const goal = await service.create(req.user._id, matchedData(req, { locations: ['body'] }));
  res.status(201).json({ success: true, data: { goal } });
});

exports.update = asyncHandler(async (req, res) => {
  const goal = await service.update(req.user._id, req.params.id, matchedData(req, { locations: ['body'] }));
  res.json({ success: true, data: { goal } });
});

exports.contribute = asyncHandler(async (req, res) => {
  const { amount } = matchedData(req, { locations: ['body'] });
  res.json({ success: true, data: { goal: await service.contribute(req.user._id, req.params.id, amount) } });
});

exports.remove = asyncHandler(async (req, res) => {
  await service.remove(req.user._id, req.params.id);
  res.json({ success: true, message: 'Goal deleted' });
});
