"""Deterministic univariate, bivariate, monthly and multivariate finance analysis."""

import numpy as np


def _rounded(value):
  if value is None or not np.isfinite(value):
    return None
  return round(float(value), 2)


def _correlation(left, right):
  left_values = np.asarray(left, dtype=float)
  right_values = np.asarray(right, dtype=float)
  if len(left_values) < 2 or len(right_values) < 2:
    return None
  if np.ptp(left_values) == 0 or np.ptp(right_values) == 0:
    return None
  return _rounded(np.corrcoef(left_values, right_values)[0, 1])


def analyze(prepared):
  """Produce JSON-compatible statistics from preprocessed Pandas frames."""
  import pandas as pd

  transactions = prepared["transactions"]
  budgets = prepared["budgets"]
  monthly_frame = prepared["monthly"]

  incomes = transactions.loc[transactions["type"] == "income", "amount"].to_numpy(dtype=float)
  expenses = transactions.loc[transactions["type"] == "expense", "amount"].to_numpy(dtype=float)
  total_income = _rounded(np.sum(incomes)) or 0.0
  total_expenditure = _rounded(np.sum(expenses)) or 0.0
  total_savings = _rounded(total_income - total_expenditure)
  savings_rate = _rounded((total_savings / total_income) * 100) if total_income > 0 else None

  if len(expenses):
    bin_count = min(10, max(1, int(np.ceil(np.sqrt(len(expenses))))))
    counts, edges = np.histogram(expenses, bins=bin_count)
    distribution = {"edges": [_rounded(edge) for edge in edges], "counts": [int(count) for count in counts]}
    expense_statistics = {
      "count": int(len(expenses)),
      "average": _rounded(np.mean(expenses)),
      "median": _rounded(np.median(expenses)),
      "minimum": _rounded(np.min(expenses)),
      "maximum": _rounded(np.max(expenses)),
      "distribution": distribution,
    }
  else:
    expense_statistics = {
      "count": 0, "average": None, "median": None, "minimum": None, "maximum": None,
      "distribution": {"edges": [], "counts": []},
    }

  if len(transactions):
    category_frame = transactions.groupby("category", as_index=False).agg(
      transactionCount=("amount", "size")
    )
    grouped_amounts = transactions.assign(
      income=transactions["amount"].where(transactions["type"] == "income", 0),
      expenditure=transactions["amount"].where(transactions["type"] == "expense", 0),
    ).groupby("category", as_index=False)[["income", "expenditure"]].sum()
    category_frame = category_frame.merge(grouped_amounts, on="category")
  else:
    category_frame = pd.DataFrame(columns=["category", "income", "expenditure", "transactionCount"])

  expense_categories = category_frame[category_frame["expenditure"] > 0].sort_values(
    ["expenditure", "category"], ascending=[False, True]
  )
  category_spending = [
    {
      "category": row.category,
      "amount": _rounded(row.expenditure),
      "sharePercent": _rounded((row.expenditure / total_expenditure) * 100) if total_expenditure else None,
      "transactionCount": int(transactions[(transactions["type"] == "expense") & (transactions["category"] == row.category)].shape[0]),
    }
    for row in expense_categories.itertuples()
  ]

  monthly = []
  for index, row in enumerate(monthly_frame.itertuples(index=False)):
    income = _rounded(row.income) or 0.0
    expenditure = _rounded(row.expenditure) or 0.0
    savings = _rounded(income - expenditure)
    previous = _rounded(monthly_frame.iloc[index - 1]["expenditure"]) if index else None
    expense_change = _rounded(expenditure - previous) if previous is not None else None
    monthly.append({
      "month": row.month,
      "income": income,
      "expenditure": expenditure,
      "savings": savings,
      "savingsRate": _rounded((savings / income) * 100) if income > 0 else None,
      "expenseChange": expense_change,
      "expenseChangePercent": _rounded((expense_change / previous) * 100) if previous else None,
    })

  monthly_income = [row["income"] for row in monthly]
  monthly_expenses = [row["expenditure"] for row in monthly]
  monthly_savings = [row["savings"] for row in monthly]
  budget_actual = []
  for row in budgets.itertuples(index=False):
    actual = _rounded(row.actual) if row.actual is not None and not np.isnan(row.actual) else None
    budget_amount = _rounded(row.amount)
    budget_actual.append({
      "category": row.category,
      "period": row.period,
      "budget": budget_amount,
      "actual": actual,
      "variance": _rounded(budget_amount - actual) if actual is not None else None,
      "utilizationPercent": _rounded((actual / budget_amount) * 100) if actual is not None and budget_amount else None,
    })

  categories = sorted(set(category_frame["category"].tolist()) | set(budgets["category"].tolist()))
  category_relationships = []
  for category in categories:
    category_rows = category_frame[category_frame["category"] == category]
    income = _rounded(category_rows["income"].sum()) or 0.0
    expenditure = _rounded(category_rows["expenditure"].sum()) or 0.0
    category_budgets = [row for row in budget_actual if row["category"] == category]
    category_relationships.append({
      "category": category,
      "income": income,
      "expenditure": expenditure,
      "savings": _rounded(income - expenditure),
      "budgets": category_budgets,
      "transactionCount": int(category_rows["transactionCount"].sum()) if len(category_rows) else 0,
    })

  return {
    "preprocessing": prepared["preprocessing"],
    "overview": {
      "totalIncome": total_income,
      "totalExpenditure": total_expenditure,
      "totalSavings": total_savings,
      "savingsRate": savings_rate,
      "transactionCount": int(len(transactions)),
    },
    "univariate": {"expenditure": expense_statistics, "categorySpending": category_spending},
    "bivariate": {
      "incomeVsExpenditure": {
        "points": [{"month": row["month"], "income": row["income"], "expenditure": row["expenditure"]} for row in monthly],
        "correlation": _correlation(monthly_income, monthly_expenses),
      },
      "incomeVsSavings": {
        "points": [{"month": row["month"], "income": row["income"], "savings": row["savings"]} for row in monthly],
        "correlation": _correlation(monthly_income, monthly_savings),
      },
      "budgetVsActual": budget_actual,
    },
    "monthly": monthly,
    "multivariate": {
      "monthlyCorrelations": {
        "incomeExpenditure": _correlation(monthly_income, monthly_expenses),
        "incomeSavings": _correlation(monthly_income, monthly_savings),
        "expenditureSavings": _correlation(monthly_expenses, monthly_savings),
      },
      "categoryRelationships": category_relationships,
    },
  }
