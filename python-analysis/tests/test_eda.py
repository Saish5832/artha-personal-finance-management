"""Unit tests for deterministic preprocessing and exploratory analysis."""
import pytest

from analysis import handle
from eda import analyze
from errors import AnalysisError
from preprocessing import preprocess, validate_payload


def tx(kind, category, amount, date):
    return {"type": kind, "category": category, "amount": amount, "date": date}


def analyze_rows(transactions, budgets=None):
    return analyze(preprocess(transactions, budgets or []))


def test_preprocessing_drops_missing_and_invalid_records_and_converts_dates():
    prepared = preprocess([
        tx("income", "Salary", "1200", "2026-01-02"),
        tx("expense", "Food", 25.5, "2026-01-03T00:00:00Z"),
        {"type": "expense", "category": "Food", "amount": None, "date": "2026-01-04"},
        tx("transfer", "Food", 3, "2026-01-04"),
        tx("expense", "Food", 1, "not-a-date"),
        None,
    ], [])
    assert len(prepared["transactions"]) == 2
    assert prepared["transactions"]["month"].tolist() == ["2026-01", "2026-01"]
    assert prepared["preprocessing"] == {
        "transactionsReceived": 6,
        "transactionsUsed": 2,
        "transactionsDropped": 4,
        "budgetsReceived": 0,
        "budgetsUsed": 0,
        "budgetsDropped": 0,
    }
    assert prepared["monthly"].to_dict("records") == [{"month": "2026-01", "income": 1200.0, "expenditure": 25.5}]


def test_univariate_statistics_and_category_spending():
    result = analyze_rows([
        tx("expense", "Food", 10, "2026-01-01"),
        tx("expense", "Food", 30, "2026-01-02"),
        tx("expense", "Travel", 20, "2026-01-03"),
    ])
    assert result["univariate"]["expenditure"] == {
        "count": 3,
        "average": 20.0,
        "median": 20.0,
        "minimum": 10.0,
        "maximum": 30.0,
        "distribution": {"edges": [10.0, 20.0, 30.0], "counts": [1, 2]},
    }
    assert result["univariate"]["categorySpending"] == [
        {"category": "Food", "amount": 40.0, "sharePercent": 66.67, "transactionCount": 2},
        {"category": "Travel", "amount": 20.0, "sharePercent": 33.33, "transactionCount": 1},
    ]


def test_overview_bivariate_and_monthly_calculations():
    result = analyze_rows([
        tx("income", "Salary", 1000, "2026-01-10"),
        tx("expense", "Food", 300, "2026-01-11"),
        tx("income", "Salary", 1200, "2026-02-10"),
        tx("expense", "Food", 400, "2026-02-11"),
    ])
    assert result["overview"] == {
        "totalIncome": 2200.0,
        "totalExpenditure": 700.0,
        "totalSavings": 1500.0,
        "savingsRate": 68.18,
        "transactionCount": 4,
    }
    assert result["monthly"] == [
        {"month": "2026-01", "income": 1000.0, "expenditure": 300.0, "savings": 700.0, "savingsRate": 70.0, "expenseChange": None, "expenseChangePercent": None},
        {"month": "2026-02", "income": 1200.0, "expenditure": 400.0, "savings": 800.0, "savingsRate": 66.67, "expenseChange": 100.0, "expenseChangePercent": 33.33},
    ]
    assert result["bivariate"]["incomeVsExpenditure"]["points"][1] == {
        "month": "2026-02", "income": 1200.0, "expenditure": 400.0
    }
    assert result["bivariate"]["incomeVsSavings"]["correlation"] == 1.0


def test_budget_actual_and_category_multivariate_relationships():
    result = analyze_rows([
        tx("income", "Salary", 1000, "2026-01-10"),
        tx("expense", "Food", 200, "2026-01-11"),
    ], [{"category": "Food", "period": "monthly", "amount": 300, "spent": 200}])
    assert result["bivariate"]["budgetVsActual"] == [{
        "category": "Food", "period": "monthly", "budget": 300.0,
        "actual": 200.0, "variance": 100.0, "utilizationPercent": 66.67,
    }]
    categories = {row["category"]: row for row in result["multivariate"]["categoryRelationships"]}
    assert categories["Food"] == {
        "category": "Food", "income": 0.0, "expenditure": 200.0, "savings": -200.0,
        "budgets": result["bivariate"]["budgetVsActual"], "transactionCount": 1,
    }
    assert categories["Salary"] == {
        "category": "Salary", "income": 1000.0, "expenditure": 0.0,
        "savings": 1000.0, "budgets": [], "transactionCount": 1,
    }


def test_gaps_between_months_are_filled_with_aggregated_zeros():
    result = analyze_rows([
        tx("income", "Salary", 100, "2026-01-01"),
        tx("expense", "Food", 10, "2026-03-01"),
    ])
    assert [row["month"] for row in result["monthly"]] == ["2026-01", "2026-02", "2026-03"]
    assert result["monthly"][1]["income"] == 0
    assert result["monthly"][1]["expenditure"] == 0
    assert result["monthly"][2]["expenseChange"] == 10


@pytest.mark.parametrize("transactions", [
    [tx("income", "Salary", 100, "2026-01-01")],
    [tx("expense", "Food", 50, "2026-01-01")],
    [],
])
def test_income_only_expense_only_and_empty_datasets_are_valid(transactions):
    result = analyze_rows(transactions)
    assert result["overview"]["transactionCount"] == len(transactions)
    assert result["bivariate"]["budgetVsActual"] == []
    if not transactions:
        assert result["overview"] == {
            "totalIncome": 0.0, "totalExpenditure": 0.0, "totalSavings": 0.0,
            "savingsRate": None, "transactionCount": 0,
        }
        assert result["monthly"] == []
        assert result["univariate"]["expenditure"]["average"] is None
    elif transactions[0]["type"] == "income":
        assert result["univariate"]["expenditure"]["count"] == 0
        assert result["overview"]["totalSavings"] == 100.0
    else:
        assert result["overview"]["savingsRate"] is None
        assert result["overview"]["totalSavings"] == -50.0


@pytest.mark.parametrize("payload, message", [
    ({}, "'transactions' must be an array"),
    ({"transactions": {}, "budgets": []}, "'transactions' must be an array"),
    ({"transactions": [], "budgets": {}}, "'budgets' must be an array"),
])
def test_invalid_payload_arrays_raise_structured_input_errors(payload, message):
    with pytest.raises(AnalysisError, match=message):
        transactions, budgets = validate_payload(payload)
        preprocess(transactions, budgets)


def test_cli_eda_operation_returns_json_and_reports_invalid_payload():
    result = handle('{"operation":"eda","transactions":[]}')
    assert result["ok"] is True
    assert result["result"]["overview"]["transactionCount"] == 0
    invalid = handle('{"operation":"eda","transactions":{}}')
    assert invalid["ok"] is False
    assert invalid["error"] == "InvalidInput"