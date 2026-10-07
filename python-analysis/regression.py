"""Simple linear regression over monthly financial aggregates; statistical analysis only."""

from datetime import date, datetime, timezone
import re

import numpy as np

from errors import AnalysisError
from preprocessing import preprocess, validate_payload


MIN_MONTHS = 3
WEAK_R_SQUARED = 0.5
STABLE_EXPENSE_SLOPE_RATIO = 0.01
NEAR_TREND_RATIO = 0.05


def validate_regression_payload(request):
  """Validate the transaction array and optional calendar asOf date."""
  transactions, _ = validate_payload({"transactions": request.get("transactions")})
  raw_as_of = request.get("asOf")
  if raw_as_of is None:
    as_of = datetime.now(timezone.utc).date()
  elif isinstance(raw_as_of, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_as_of):
    try:
      as_of = date.fromisoformat(raw_as_of)
    except ValueError as exc:
      raise AnalysisError("InvalidInput", "'asOf' must be a valid date in YYYY-MM-DD format") from exc
  else:
    raise AnalysisError("InvalidInput", "'asOf' must be a valid date in YYYY-MM-DD format")
  return transactions, as_of


def prepare_monthly_data(transactions, as_of):
  """Reuse shared transaction cleaning and monthly aggregation, limited to asOf month."""
  prepared = preprocess(transactions, [])
  month_limit = as_of.strftime("%Y-%m")
  monthly = prepared["monthly"]
  monthly = monthly[monthly["month"] <= month_limit].reset_index(drop=True)
  rows = []
  for month_index, row in enumerate(monthly.itertuples(index=False)):
    income = round(float(row.income), 2)
    expenditure = round(float(row.expenditure), 2)
    rows.append({
      "month": row.month,
      "monthIndex": month_index,
      "income": income,
      "expenditure": expenditure,
      "savings": round(income - expenditure, 2),
    })
  return rows


def calculate_linear_regression(x_values, y_values):
  """Calculate y = mx + b and R-squared using NumPy least squares."""
  x = np.asarray(x_values, dtype=float)
  y = np.asarray(y_values, dtype=float)
  if len(x) != len(y) or len(x) < MIN_MONTHS:
    return None
  if not np.all(np.isfinite(x)) or not np.all(np.isfinite(y)):
    return None
  if np.ptp(x) <= max(1e-9, abs(float(np.mean(x))) * 1e-9):
    return None

  design = np.column_stack((x, np.ones(len(x))))
  coefficients, _, _, _ = np.linalg.lstsq(design, y, rcond=None)
  slope, intercept = (float(coefficients[0]), float(coefficients[1]))
  fitted = design @ coefficients
  residual_sum = float(np.sum((y - fitted) ** 2))
  total_sum = float(np.sum((y - np.mean(y)) ** 2))
  if total_sum <= max(1e-9, float(np.sum(y ** 2)) * 1e-12):
    r_squared = 1.0 if residual_sum <= 1e-9 else 0.0
  else:
    r_squared = max(0.0, min(1.0, 1.0 - residual_sum / total_sum))
  return {
    "coefficient": slope,
    "intercept": intercept,
    "rSquared": r_squared,
    "fittedValues": fitted.tolist(),
  }


def _rounded(value, digits=2):
  return round(float(value), digits) if value is not None and np.isfinite(value) else None


def _equation(coefficient, intercept):
  sign = "+" if intercept >= 0 else "-"
  return f"y = {coefficient:.2f}x {sign} {abs(intercept):.2f}"


def _insufficient(monthly_data, message):
  return {
    "status": "insufficient_data",
    "monthsAnalyzed": len(monthly_data),
    "coefficient": None,
    "intercept": None,
    "rSquared": None,
    "equation": None,
    "interpretation": message,
    "monthlyData": monthly_data,
    "fittedValues": [],
  }


def classify_income_savings_relationship(fit, monthly_data):
  """Classify association by relative slope magnitude and historical R²."""
  average_income = float(np.mean([row["income"] for row in monthly_data]))
  average_savings = float(np.mean([row["savings"] for row in monthly_data]))
  meaningful_change = abs(fit["coefficient"]) * max(average_income, 1.0)
  stable_limit = max(abs(average_savings) * STABLE_EXPENSE_SLOPE_RATIO, 1.0)
  if meaningful_change <= stable_limit:
    return "stable", "Monthly income and savings showed a relatively stable historical relationship."
  if fit["rSquared"] < WEAK_R_SQUARED:
    return "weak", "The analyzed data does not show a strong linear relationship between monthly income and savings."
  if fit["coefficient"] > 0:
    return "positive", "Higher income was associated with higher savings in the analyzed historical data."
  return "negative", "The analyzed historical data shows an inverse relationship between monthly income and savings."


def classify_expenditure_trend(fit, monthly_data):
  """Use 1% of mean spending as stable-slope tolerance and R² >= 0.5 as a useful fit."""
  average_expenditure = float(np.mean([row["expenditure"] for row in monthly_data]))
  stable_limit = max(average_expenditure * STABLE_EXPENSE_SLOPE_RATIO, 1.0)
  if abs(fit["coefficient"]) <= stable_limit:
    return "stable"
  if fit["rSquared"] < WEAK_R_SQUARED:
    return "weak"
  return "increasing" if fit["coefficient"] > 0 else "decreasing"


def _money(value):
  return f"₹{abs(value):,.0f}"


def _expenditure_interpretation(trend, coefficient):
  change = _money(coefficient)
  if trend == "increasing":
    return f"Your monthly expenditure shows an increasing historical trend, rising by approximately {change} per month on average across the analyzed period."
  if trend == "decreasing":
    return f"Your monthly expenditure shows a decreasing historical trend of approximately {change} per month across the analyzed period."
  if trend == "stable":
    return "Your monthly expenditure has remained relatively stable across the analyzed period."
  return "Your historical expenditure data does not show a strong linear trend."


def _current_vs_trend(monthly_data, fitted_values, as_of):
  current_month = as_of.strftime("%Y-%m")
  current_index = next((index for index, row in enumerate(monthly_data) if row["month"] == current_month), None)
  if current_index is None:
    return None
  actual = monthly_data[current_index]["expenditure"]
  trend_value = float(fitted_values[current_index])
  difference = actual - trend_value
  percentage = difference / abs(trend_value) * 100 if abs(trend_value) > 1e-9 else None
  near_limit = max(abs(trend_value) * NEAR_TREND_RATIO, 1.0)
  if abs(difference) <= near_limit:
    status = "near_trend"
    interpretation = "Your current expenditure is close to the historical spending trend."
  elif difference > 0:
    status = "above_trend"
    interpretation = f"Your current expenditure is approximately {_money(difference)} above your historical spending trend."
  else:
    status = "below_trend"
    interpretation = f"Your current expenditure is approximately {_money(difference)} below your historical spending trend."
  return {
    "actual": _rounded(actual),
    "trendValue": _rounded(trend_value),
    "difference": _rounded(difference),
    "percentageDifference": _rounded(percentage),
    "status": status,
    "interpretation": interpretation,
  }


def analyze_regression(transactions, as_of):
  """Return historical income/savings and expenditure regression summaries."""
  monthly_data = prepare_monthly_data(transactions, as_of)
  minimum_message = f"At least {MIN_MONTHS} months of historical data are required to calculate a meaningful trend."
  income_savings = _insufficient(monthly_data, minimum_message)
  income_savings["relationship"] = "weak"
  expenditure = _insufficient(monthly_data, minimum_message)
  expenditure.update({"trend": "weak", "averageMonthlyChange": None, "currentVsTrend": None})

  if len(monthly_data) >= MIN_MONTHS:
    income = [row["income"] for row in monthly_data]
    savings = [row["savings"] for row in monthly_data]
    income_fit = calculate_linear_regression(income, savings)
    if income_fit is None:
      income_savings = _insufficient(
        monthly_data,
        "Monthly income does not vary enough to calculate a meaningful historical relationship with savings.",
      )
      income_savings["relationship"] = "weak"
    else:
      relationship, interpretation = classify_income_savings_relationship(income_fit, monthly_data)
      income_savings = {
        "status": "ok",
        "monthsAnalyzed": len(monthly_data),
        "coefficient": _rounded(income_fit["coefficient"], 6),
        "intercept": _rounded(income_fit["intercept"]),
        "rSquared": _rounded(income_fit["rSquared"], 4),
        "equation": _equation(income_fit["coefficient"], income_fit["intercept"]),
        "relationship": relationship,
        "interpretation": interpretation,
        "monthlyData": monthly_data,
        "fittedValues": [_rounded(value) for value in income_fit["fittedValues"]],
      }

    month_index = [row["monthIndex"] for row in monthly_data]
    expenses = [row["expenditure"] for row in monthly_data]
    expense_fit = calculate_linear_regression(month_index, expenses)
    if expense_fit is not None:
      trend = classify_expenditure_trend(expense_fit, monthly_data)
      expenditure = {
        "status": "ok",
        "monthsAnalyzed": len(monthly_data),
        "coefficient": _rounded(expense_fit["coefficient"]),
        "intercept": _rounded(expense_fit["intercept"]),
        "rSquared": _rounded(expense_fit["rSquared"], 4),
        "equation": _equation(expense_fit["coefficient"], expense_fit["intercept"]),
        "trend": trend,
        "averageMonthlyChange": _rounded(expense_fit["coefficient"]),
        "interpretation": _expenditure_interpretation(trend, expense_fit["coefficient"]),
        "currentVsTrend": _current_vs_trend(monthly_data, expense_fit["fittedValues"], as_of),
        "monthlyData": monthly_data,
        "fittedValues": [_rounded(value) for value in expense_fit["fittedValues"]],
      }

  return {"asOf": as_of.isoformat(), "incomeSavings": income_savings, "expenditureTrend": expenditure}


def regression_operation(request):
  transactions, as_of = validate_regression_payload(request)
  return analyze_regression(transactions, as_of)
