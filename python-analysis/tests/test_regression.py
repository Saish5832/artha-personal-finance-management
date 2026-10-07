"""Unit tests for statistical financial trend regression."""
from datetime import date

import numpy as np
import pytest

from analysis import handle
from errors import AnalysisError
from regression import (
    analyze_regression,
    calculate_linear_regression,
    classify_expenditure_trend,
    prepare_monthly_data,
    validate_regression_payload,
)


AS_OF = date(2026, 5, 20)


def monthly_transactions(incomes, expenses):
    rows = []
    for index, (income, expense) in enumerate(zip(incomes, expenses), start=1):
        month = f"2026-{index:02d}"
        rows.append({"type": "income", "category": "Salary", "amount": income, "date": f"{month}-05"})
        rows.append({"type": "expense", "category": "Food", "amount": expense, "date": f"{month}-10"})
    return rows


def test_linear_regression_calculates_expected_slope_intercept_and_r_squared():
    fit = calculate_linear_regression([0, 1, 2, 3, 4], [10000, 12000, 14000, 16000, 18000])
    assert fit["coefficient"] == pytest.approx(2000)
    assert fit["intercept"] == pytest.approx(10000)
    assert fit["rSquared"] == pytest.approx(1)
    assert fit["fittedValues"] == pytest.approx([10000, 12000, 14000, 16000, 18000])


def test_income_savings_relation_is_positive_with_strong_fit():
    rows = monthly_transactions([30000, 35000, 40000, 45000, 50000], [25000, 28000, 31000, 34000, 37000])
    analysis = analyze_regression(rows, AS_OF)["incomeSavings"]
    assert analysis["status"] == "ok"
    assert analysis["monthsAnalyzed"] == 5
    assert analysis["relationship"] == "positive"
    assert analysis["coefficient"] == pytest.approx(0.4, abs=1e-6)
    assert analysis["rSquared"] == pytest.approx(1)
    assert "associated with higher savings" in analysis["interpretation"]
    assert "caus" not in analysis["interpretation"].lower()


def test_expenditure_trend_and_current_month_comparison():
    rows = monthly_transactions([30000] * 5, [10000, 12000, 14000, 16000, 18000])
    trend = analyze_regression(rows, AS_OF)["expenditureTrend"]
    assert trend["status"] == "ok"
    assert trend["trend"] == "increasing"
    assert trend["coefficient"] == pytest.approx(2000)
    assert trend["averageMonthlyChange"] == pytest.approx(2000)
    assert trend["rSquared"] == pytest.approx(1)
    assert trend["currentVsTrend"]["actual"] == 18000
    assert trend["currentVsTrend"]["trendValue"] == pytest.approx(18000)
    assert trend["currentVsTrend"]["status"] == "near_trend"


@pytest.mark.parametrize("count", [0, 1, 2])
def test_fewer_than_three_months_returns_insufficient_data(count):
    rows = monthly_transactions([30000] * count, [10000] * count)
    result = analyze_regression(rows, AS_OF)
    assert result["incomeSavings"]["status"] == "insufficient_data"
    assert result["expenditureTrend"]["status"] == "insufficient_data"
    assert result["expenditureTrend"]["currentVsTrend"] is None
    assert result["expenditureTrend"]["coefficient"] is None
    assert "At least 3 months" in result["expenditureTrend"]["interpretation"]


def test_constant_expenditure_is_stable_and_income_variation_is_required():
    rows = monthly_transactions([30000] * 4, [10000] * 4)
    result = analyze_regression(rows, AS_OF)
    assert result["expenditureTrend"]["trend"] == "stable"
    assert result["expenditureTrend"]["coefficient"] == pytest.approx(0, abs=1e-8)
    assert result["expenditureTrend"]["rSquared"] == 1
    assert result["incomeSavings"]["status"] == "insufficient_data"
    assert "does not vary enough" in result["incomeSavings"]["interpretation"]


def test_month_aggregation_savings_and_as_of_filtering():
    rows = [
        {"type": "income", "category": "Salary", "amount": 1000, "date": "2026-01-01"},
        {"type": "income", "category": "Salary", "amount": 500, "date": "2026-01-20"},
        {"type": "expense", "category": "Food", "amount": 200, "date": "2026-01-05"},
        {"type": "expense", "category": "Food", "amount": 100, "date": "2026-02-05"},
        {"type": "expense", "category": "Food", "amount": 50, "date": "2026-06-01"},
        {"type": "expense", "category": "Food", "amount": -1, "date": "2026-02-10"},
    ]
    monthly = prepare_monthly_data(rows, date(2026, 2, 28))
    assert monthly == [
        {"month": "2026-01", "monthIndex": 0, "income": 1500, "expenditure": 200, "savings": 1300},
        {"month": "2026-02", "monthIndex": 1, "income": 0, "expenditure": 100, "savings": -100},
    ]


def test_current_vs_trend_above_below_and_missing_month():
    above = analyze_regression(monthly_transactions([1000] * 5, [10000, 12000, 14000, 16000, 25000]), AS_OF)
    assert above["expenditureTrend"]["currentVsTrend"]["status"] == "above_trend"
    assert above["expenditureTrend"]["currentVsTrend"]["difference"] > 0
    below = analyze_regression(monthly_transactions([1000] * 5, [10000, 12000, 14000, 16000, 10000]), AS_OF)
    assert below["expenditureTrend"]["currentVsTrend"]["status"] == "below_trend"
    missing_current = analyze_regression(monthly_transactions([1000] * 4, [10000, 12000, 14000, 16000]), AS_OF)
    assert missing_current["expenditureTrend"]["currentVsTrend"] is None


def test_invalid_regression_payload_is_structured():
    with pytest.raises(AnalysisError):
        validate_regression_payload({"transactions": [], "asOf": "2026-02-30"})
    reply = handle('{"operation":"regression","transactions":{},"asOf":"2026-05-20"}')
    assert reply["ok"] is False
    assert reply["error"] == "InvalidInput"


def test_weak_expenditure_fit_classification():
    fit = {"coefficient": 10, "intercept": 1000, "rSquared": 0.2}
    monthly = [{"expenditure": 1000}, {"expenditure": 1010}, {"expenditure": 980}]
    assert classify_expenditure_trend(fit, monthly) == "weak"


def test_regression_handles_constant_values_without_non_finite_results():
    fit = calculate_linear_regression([0, 1, 2], [5, 5, 5])
    assert fit is not None
    assert np.isfinite(fit["coefficient"])
    assert fit["rSquared"] == 1