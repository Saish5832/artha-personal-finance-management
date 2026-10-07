const Transaction = require('../models/Transaction');
const { runPython } = require('./pythonBridge');

async function analyzeUser(userId, asOf = new Date()) {
  const transactions = await Transaction.find({ userId })
    .select('type category amount date')
    .sort({ date: 1, _id: 1 })
    .lean();

  return runPython('regression', {
    transactions,
    asOf: asOf.toISOString().slice(0, 10),
  });
}

module.exports = { analyzeUser };