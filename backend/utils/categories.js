/**
 * Fixed category lists. Using a closed list (instead of free text) keeps analytics, budgets and the
 * rule engine deterministic: "Food" can never also appear as "food " or "FOOD".
 */
const EXPENSE_CATEGORIES = [
  'Food', 'Rent', 'Transport', 'Utilities', 'Shopping', 'Entertainment',
  'Health', 'Education', 'Travel', 'Insurance', 'EMI/Loan', 'Other',
];
const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Business', 'Investment', 'Gift', 'Other'];
const TYPES = ['income', 'expense'];

function categoriesFor(type) {
  if (type === 'income') return INCOME_CATEGORIES;
  if (type === 'expense') return EXPENSE_CATEGORIES;
  return [];
}

module.exports = { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TYPES, categoriesFor };
