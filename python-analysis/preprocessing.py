"""Validate and prepare transaction and budget records for statistical analysis."""

from errors import AnalysisError


TRANSACTION_COLUMNS = ["type", "category", "amount", "date", "month"]


def _amount(value, *, allow_zero=False):
  import math

  if isinstance(value, bool):
    return None
  try:
    result = float(value)
  except (TypeError, ValueError, OverflowError):
    return None
  if not math.isfinite(result) or result < 0 or (result == 0 and not allow_zero):
    return None
  return round(result, 2)


def validate_payload(request):
  """Require array-shaped input; individual malformed records are counted and dropped."""
  if not isinstance(request.get("transactions"), list):
    raise AnalysisError("InvalidInput", "'transactions' must be an array")
  budgets = request.get("budgets", [])
  if not isinstance(budgets, list):
    raise AnalysisError("InvalidInput", "'budgets' must be an array")
  return request["transactions"], budgets


def preprocess(transactions, budgets):
  """Clean records and create shared monthly aggregates using Pandas."""
  import pandas as pd

  clean_transactions = []
  dropped_transactions = 0
  for record in transactions:
    if not isinstance(record, dict):
      dropped_transactions += 1
      continue
    transaction_type = record.get("type")
    category = record.get("category")
    amount = _amount(record.get("amount"))
    try:
      date = pd.to_datetime(record.get("date"), errors="coerce", utc=True)
    except (TypeError, ValueError):
      date = pd.NaT
    if (
      transaction_type not in ("income", "expense")
      or not isinstance(category, str)
      or not category.strip()
      or amount is None
      or pd.isna(date)
    ):
      dropped_transactions += 1
      continue
    clean_transactions.append({
      "type": transaction_type,
      "category": category.strip(),
      "amount": amount,
      "date": date,
      "month": date.strftime("%Y-%m"),
    })

  transaction_frame = pd.DataFrame(clean_transactions, columns=TRANSACTION_COLUMNS)
  if not transaction_frame.empty:
    transaction_frame["amount"] = pd.to_numeric(transaction_frame["amount"], errors="coerce")
    transaction_frame["date"] = pd.to_datetime(transaction_frame["date"], utc=True)

  clean_budgets = []
  dropped_budgets = 0
  for record in budgets:
    if not isinstance(record, dict):
      dropped_budgets += 1
      continue
    category = record.get("category")
    amount = _amount(record.get("amount"))
    if not isinstance(category, str) or not category.strip() or amount is None:
      dropped_budgets += 1
      continue
    spent = _amount(record.get("spent"), allow_zero=True)
    clean_budgets.append({
      "category": category.strip(),
      "period": record.get("period") if isinstance(record.get("period"), str) else "unknown",
      "amount": amount,
      "actual": spent,
    })

  budget_frame = pd.DataFrame(clean_budgets, columns=["category", "period", "amount", "actual"])
  if transaction_frame.empty:
    monthly_frame = pd.DataFrame(columns=["month", "income", "expenditure"])
  else:
    grouped = transaction_frame.assign(
      income=transaction_frame["amount"].where(transaction_frame["type"] == "income", 0),
      expenditure=transaction_frame["amount"].where(transaction_frame["type"] == "expense", 0),
    ).groupby("month", as_index=True)[["income", "expenditure"]].sum()
    months = pd.period_range(grouped.index.min(), grouped.index.max(), freq="M").astype(str)
    monthly_frame = grouped.reindex(months, fill_value=0).rename_axis("month").reset_index()

  return {
    "transactions": transaction_frame,
    "budgets": budget_frame,
    "monthly": monthly_frame,
    "preprocessing": {
      "transactionsReceived": len(transactions),
      "transactionsUsed": len(transaction_frame),
      "transactionsDropped": dropped_transactions,
      "budgetsReceived": len(budgets),
      "budgetsUsed": len(budget_frame),
      "budgetsDropped": dropped_budgets,
    },
  }
