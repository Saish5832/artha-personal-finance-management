/**
 * Transaction business logic. EVERY query includes { userId }, so one user can never read,
 * change or delete another user's transaction. A transaction that belongs to someone else is
 * reported as "not found" (404), the same as one that does not exist, so ids cannot be probed.
 */
const Transaction = require('../models/Transaction');
const AppError = require('../utils/AppError');
const { round2 } = require('../utils/money');

const EDITABLE = ['type', 'category', 'amount', 'date', 'description'];
const pickEditable = (data) => Object.fromEntries(EDITABLE.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const notFound = () => AppError.notFound('Transaction not found');

/** Turn the validated query string into a MongoDB filter (always scoped to the user). */
function buildFilter(userId, f) {
  const filter = { userId };
  if (f.type) filter.type = f.type;
  if (f.category) filter.category = f.category;

  if (f.from || f.to) {
    filter.date = {};
    if (f.from) filter.date.$gte = f.from;
    if (f.to) filter.date.$lt = new Date(f.to.getTime() + 24 * 60 * 60 * 1000); // "to" is inclusive of that whole day
  }
  if (f.minAmount !== undefined || f.maxAmount !== undefined) {
    filter.amount = {};
    if (f.minAmount !== undefined) filter.amount.$gte = f.minAmount;
    if (f.maxAmount !== undefined) filter.amount.$lte = f.maxAmount;
  }
  if (f.q) {
    const pattern = escapeRegex(f.q); // user text is escaped: it can never become a regex
    filter.$or = [{ description: { $regex: pattern, $options: 'i' } }, { category: { $regex: pattern, $options: 'i' } }];
  }
  return filter;
}

async function list(userId, f) {
  const page = f.page || 1;
  const limit = f.limit || 20;
  const sortBy = f.sortBy || 'date';
  const direction = f.order === 'asc' ? 1 : -1;
  const filter = buildFilter(userId, f);

  const [items, total, grouped] = await Promise.all([
    Transaction.find(filter).sort({ [sortBy]: direction, _id: direction }).skip((page - 1) * limit).limit(limit),
    Transaction.countDocuments(filter),
    Transaction.aggregate([{ $match: filter }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
  ]);

  const sum = (type) => round2((grouped.find((g) => g._id === type) || { total: 0 }).total);
  const income = sum('income');
  const expense = sum('expense');
  return {
    items,
    pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
    // Totals cover ALL transactions matching the filters, not just the current page.
    totals: { income, expense, net: round2(income - expense) },
  };
}

async function create(userId, data) {
  return Transaction.create({ ...pickEditable(data), userId });
}

async function getById(userId, id) {
  const tx = await Transaction.findOne({ _id: id, userId });
  if (!tx) throw notFound();
  return tx;
}

async function update(userId, id, data) {
  const tx = await getById(userId, id);
  tx.set({ ...pickEditable(data), description: data.description ?? '' }); // PUT replaces: an omitted description is cleared
  await tx.save(); // runs the schema validators again (e.g. category must match type)
  return tx;
}

async function remove(userId, id) {
  const tx = await Transaction.findOneAndDelete({ _id: id, userId });
  if (!tx) throw notFound();
  return tx;
}

module.exports = { list, create, getById, update, remove, buildFilter };
