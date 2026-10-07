/** HTTP layer for transactions. The caller's identity is always req.user._id (from the verified JWT). */
const { matchedData } = require('express-validator');
const service = require('../services/transactionService');
const asyncHandler = require('../utils/asyncHandler');
const { EXPENSE_CATEGORIES, INCOME_CATEGORIES } = require('../utils/categories');

exports.categories = (req, res) => {
  res.json({ success: true, data: { income: INCOME_CATEGORIES, expense: EXPENSE_CATEGORIES } });
};

exports.list = asyncHandler(async (req, res) => {
  const filters = matchedData(req, { locations: ['query'] });
  res.json({ success: true, data: await service.list(req.user._id, filters) });
});

exports.create = asyncHandler(async (req, res) => {
  const tx = await service.create(req.user._id, matchedData(req, { locations: ['body'] }));
  res.status(201).json({ success: true, data: { transaction: tx } });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { transaction: await service.getById(req.user._id, req.params.id) } });
});

exports.update = asyncHandler(async (req, res) => {
  const tx = await service.update(req.user._id, req.params.id, matchedData(req, { locations: ['body'] }));
  res.json({ success: true, data: { transaction: tx } });
});

exports.remove = asyncHandler(async (req, res) => {
  await service.remove(req.user._id, req.params.id);
  res.json({ success: true, message: 'Transaction deleted' });
});
