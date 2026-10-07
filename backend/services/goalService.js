/** Savings-goal business logic. Every query is scoped by userId (see transactionService for the ownership policy). */
const Goal = require('../models/Goal');
const AppError = require('../utils/AppError');
const calc = require('./goalCalculator');
const { round2, MAX_AMOUNT } = require('../utils/money');

const notFound = () => AppError.notFound('Goal not found');

function fromInput(data) {
  return {
    name: data.name,
    targetAmount: data.targetAmount,
    currentAmount: data.currentAmount ?? 0,
    monthlyContribution: data.monthlyContribution ?? 0,
    targetDate: data.targetDate ?? null,
  };
}

async function list(userId, asOf = new Date()) {
  const goals = await Goal.find({ userId }).sort({ createdAt: -1, _id: -1 });
  const items = goals.map((g) => calc.describe(g, asOf));
  return {
    items,
    summary: {
      count: items.length,
      active: items.filter((g) => g.status === 'active').length,
      completed: items.filter((g) => g.status === 'completed').length,
    },
  };
}

async function findOwned(userId, id) {
  const goal = await Goal.findOne({ _id: id, userId });
  if (!goal) throw notFound();
  return goal;
}

async function getById(userId, id, asOf = new Date()) {
  return calc.describe(await findOwned(userId, id), asOf);
}

async function create(userId, data) {
  const goal = await Goal.create({ ...fromInput(data), userId });
  return calc.describe(goal);
}

async function update(userId, id, data) {
  const goal = await findOwned(userId, id);
  goal.set(fromInput(data));
  await goal.save();
  return calc.describe(goal);
}

/** Add money towards a goal (increases currentAmount). */
async function contribute(userId, id, amount) {
  const goal = await findOwned(userId, id);
  const next = round2(goal.currentAmount + amount);
  if (next > MAX_AMOUNT) throw AppError.validation('Current amount would be too large', { fields: { amount: 'Contribution is too large' } });
  goal.currentAmount = next;
  await goal.save();
  return calc.describe(goal);
}

async function remove(userId, id) {
  const goal = await Goal.findOneAndDelete({ _id: id, userId });
  if (!goal) throw notFound();
  return goal;
}

module.exports = { list, getById, create, update, contribute, remove };
