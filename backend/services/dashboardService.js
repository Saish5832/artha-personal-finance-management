const Transaction = require('../models/Transaction');
const budgetService = require('./budgetService');
const goalService = require('./goalService');
const { calculateDashboard, chartMonths } = require('./dashboardCalculator');

async function getDashboard(userId, asOf = new Date()) {
  const months = chartMonths(asOf);
  const rangeStart = months[0].start;
  const rangeEnd = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 1));

  const [transactionFacets, budgets, goals] = await Promise.all([
    Transaction.aggregate([
      { $match: { userId } },
      {
        $facet: {
          totals: [{
            $group: {
              _id: null,
              income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
              expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
              count: { $sum: 1 },
            },
          }],
          monthly: [
            { $match: { date: { $gte: rangeStart, $lt: rangeEnd } } },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: 'UTC' } },
                income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
                expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
              },
            },
          ],
          allCategories: [
            { $match: { type: 'expense' } },
            { $group: { _id: '$category', amount: { $sum: '$amount' } } },
          ],
          chartCategories: [
            { $match: { type: 'expense', date: { $gte: rangeStart, $lt: rangeEnd } } },
            { $group: { _id: '$category', amount: { $sum: '$amount' } } },
            { $sort: { amount: -1, _id: 1 } },
          ],
          recent: [
            { $sort: { date: -1, createdAt: -1, _id: -1 } },
            { $limit: 10 },
            { $project: { date: 1, description: 1, category: 1, type: 1, amount: 1 } },
          ],
        },
      },
    ]),
    budgetService.list(userId, { asOf }),
    goalService.list(userId, asOf),
  ]);

  const data = transactionFacets[0] || {};
  return calculateDashboard({
    asOf,
    transactionData: {
      totals: data.totals || [],
      monthly: data.monthly || [],
      allCategories: data.allCategories || [],
      chartCategories: data.chartCategories || [],
      recent: data.recent || [],
    },
    budgetData: budgets,
    goalData: goals,
  });
}

module.exports = { getDashboard };