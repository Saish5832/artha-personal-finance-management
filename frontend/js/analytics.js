(function () {
  var el = Artha.dom.el;
  var charts = [];
  var currency = Artha.utils.formatINR;

  function stat(label, value, detail) {
    var node = el('article', { className: 'analytics-stat' });
    node.appendChild(el('p', { className: 'analytics-stat__label', text: label }));
    node.appendChild(el('p', { className: 'analytics-stat__value', text: value }));
    if (detail) node.appendChild(el('p', { className: 'analytics-stat__detail', text: detail }));
    return node;
  }

  function reset(container) { Artha.dom.clear(container); }

  function renderStats(data) {
    var overview = data.overview;
    var overviewNode = document.getElementById('analytics-overview');
    reset(overviewNode);
    [
      stat('Total income', currency(overview.totalIncome)),
      stat('Total expenditure', currency(overview.totalExpenditure)),
      stat('Total savings', currency(overview.totalSavings)),
      stat('Savings rate', overview.savingsRate === null ? 'N/A' : Artha.utils.formatPercent(overview.savingsRate)),
      stat('Transactions analyzed', String(overview.transactionCount))
    ].forEach(function (item) { overviewNode.appendChild(item); });

    var expenditure = data.univariate.expenditure;
    var expenseStats = document.getElementById('expense-statistics');
    reset(expenseStats);
    [
      stat('Average expenditure', expenditure.average === null ? 'N/A' : currency(expenditure.average)),
      stat('Median expenditure', expenditure.median === null ? 'N/A' : currency(expenditure.median)),
      stat('Minimum expenditure', expenditure.minimum === null ? 'N/A' : currency(expenditure.minimum)),
      stat('Maximum expenditure', expenditure.maximum === null ? 'N/A' : currency(expenditure.maximum))
    ].forEach(function (item) { expenseStats.appendChild(item); });

    var correlations = data.multivariate.monthlyCorrelations;
    var correlationNode = document.getElementById('multivariate-correlations');
    reset(correlationNode);
    [
      stat('Income / expenditure correlation', formatCorrelation(correlations.incomeExpenditure), 'Monthly Pearson correlation'),
      stat('Income / savings correlation', formatCorrelation(correlations.incomeSavings), 'Monthly Pearson correlation'),
      stat('Expenditure / savings correlation', formatCorrelation(correlations.expenditureSavings), 'Monthly Pearson correlation')
    ].forEach(function (item) { correlationNode.appendChild(item); });

    var preprocessing = data.preprocessing;
    document.getElementById('preprocessing-note').textContent =
      preprocessing.transactionsUsed + ' valid transactions included; ' + preprocessing.transactionsDropped + ' invalid transaction records removed.';
  }

  function formatCorrelation(value) {
    return value === null ? 'Not enough variation' : value.toFixed(2);
  }

  function chartOptions() {
    var text = getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim();
    var border = getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: text, usePointStyle: true, boxWidth: 8 } } },
      scales: {
        x: { ticks: { color: text }, grid: { color: border } },
        y: { beginAtZero: true, ticks: { color: text, callback: function (value) { return currency(value); } }, grid: { color: border } }
      }
    };
  }

  function draw(id, type, labels, datasets, options) {
    charts.push(new Chart(document.getElementById(id), {
      type: type,
      data: { labels: labels, datasets: datasets },
      options: Object.assign(chartOptions(), options || {})
    }));
  }

  function visibility(canvasId, emptyId, hasData) {
    document.getElementById(canvasId).parentNode.hidden = !hasData;
    document.getElementById(emptyId).hidden = hasData;
  }

  function renderCharts(data) {
    charts.forEach(function (chart) { chart.destroy(); });
    charts = [];
    var palette = ['#087f5b', '#d94841', '#3266c5', '#d18a18', '#168b9a', '#7c5caa', '#718096'];
    var expense = data.univariate.expenditure;
    var distribution = expense.distribution;
    var bins = distribution.counts.map(function (count, index) {
      return currency(distribution.edges[index]) + ' to ' + currency(distribution.edges[index + 1]);
    });
    visibility('eda-distribution', 'distribution-empty', distribution.counts.length > 0);
    if (distribution.counts.length) {
      draw('eda-distribution', 'bar', bins, [{ label: 'Expense records', data: distribution.counts, backgroundColor: '#d18a18' }], {
        scales: { y: { beginAtZero: true, ticks: { callback: function (value) { return value; } } } }
      });
    }

    var categories = data.univariate.categorySpending;
    visibility('eda-categories', 'categories-empty', categories.length > 0);
    if (categories.length) {
      draw('eda-categories', 'bar', categories.map(function (item) { return item.category; }), [{
        label: 'Expenditure', data: categories.map(function (item) { return item.amount; }), backgroundColor: palette
      }], {
        indexAxis: 'y',
        scales: {
          x: { ticks: { callback: function (value) { return currency(value); } } },
          y: { ticks: { callback: function (value, index) { return categories[index].category; } } }
        }
      });
    }

    var incomeExpense = data.bivariate.incomeVsExpenditure;
    visibility('eda-income-expense', 'income-expense-empty', incomeExpense.points.length > 0);
    document.getElementById('income-expense-correlation').textContent = 'Pearson correlation: ' + formatCorrelation(incomeExpense.correlation);
    if (incomeExpense.points.length) {
      draw('eda-income-expense', 'scatter', [], [{
        label: 'Monthly observations', data: incomeExpense.points.map(function (point) {
          return { x: point.income, y: point.expenditure, month: point.month };
        }), backgroundColor: '#3266c5'
      }], scatterOptions('Monthly income', 'Monthly expenditure'));
    }

    var incomeSavings = data.bivariate.incomeVsSavings;
    visibility('eda-income-savings', 'income-savings-empty', incomeSavings.points.length > 0);
    document.getElementById('income-savings-correlation').textContent = 'Pearson correlation: ' + formatCorrelation(incomeSavings.correlation);
    if (incomeSavings.points.length) {
      draw('eda-income-savings', 'scatter', [], [{
        label: 'Monthly observations', data: incomeSavings.points.map(function (point) {
          return { x: point.income, y: point.savings, month: point.month };
        }), backgroundColor: '#168b9a'
      }], scatterOptions('Monthly income', 'Monthly savings'));
    }

    var budgetRows = data.bivariate.budgetVsActual.filter(function (row) { return row.actual !== null; });
    visibility('eda-budget-actual', 'budget-actual-empty', budgetRows.length > 0);
    if (budgetRows.length) {
      draw('eda-budget-actual', 'bar', budgetRows.map(function (row) { return row.category + ' (' + row.period + ')'; }), [
        { label: 'Budget', data: budgetRows.map(function (row) { return row.budget; }), backgroundColor: '#3266c5' },
        { label: 'Actual', data: budgetRows.map(function (row) { return row.actual; }), backgroundColor: '#d94841' }
      ], budgetRows.length > 4 ? {
        indexAxis: 'y',
        scales: {
          x: { ticks: { callback: function (value) { return currency(value); } } },
          y: { ticks: { callback: function (value, index) { return budgetRows[index].category + ' (' + budgetRows[index].period + ')'; } } }
        }
      } : undefined);
    }

    var monthly = data.monthly;
    visibility('eda-monthly-cashflow', 'monthly-cashflow-empty', monthly.length > 0);
    visibility('eda-monthly-savings', 'monthly-savings-empty', monthly.length > 0);
    if (monthly.length) {
      var labels = monthly.map(function (row) { return row.month; });
      draw('eda-monthly-cashflow', 'bar', labels, [
        { label: 'Income', data: monthly.map(function (row) { return row.income; }), backgroundColor: '#087f5b' },
        { label: 'Expenditure', data: monthly.map(function (row) { return row.expenditure; }), backgroundColor: '#d94841' }
      ]);
      draw('eda-monthly-savings', 'line', labels, [
        { label: 'Savings', data: monthly.map(function (row) { return row.savings; }), borderColor: '#168b9a', backgroundColor: 'rgba(22, 139, 154, 0.12)', fill: true, tension: 0.25 },
        { label: 'Savings rate (%)', data: monthly.map(function (row) { return row.savingsRate; }), borderColor: '#d18a18', yAxisID: 'y1', spanGaps: false }
      ], { scales: Object.assign(chartOptions().scales, {
        y: { beginAtZero: true, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim(), callback: function (value) { return currency(value); } } },
        y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#d18a18', callback: function (value) { return value + '%'; } } }
      }) });
    }
  }

  function scatterOptions(xTitle, yTitle) {
    var options = chartOptions();
    options.scales.x = { type: 'linear', title: { display: true, text: xTitle }, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim(), callback: function (value) { return currency(value); } } };
    options.scales.y.title = { display: true, text: yTitle };
    options.plugins.tooltip = { callbacks: { title: function (items) { return items[0].raw.month; } } };
    return options;
  }

  function renderMonthlyTable(rows) {
    var body = document.getElementById('monthly-rows');
    reset(body);
    document.getElementById('monthly-table-empty').hidden = rows.length > 0;
    if (!rows.length) return;
    rows.forEach(function (item) {
      var row = el('tr');
      [
        el('td', { text: item.month }),
        el('td', { className: 'num', text: currency(item.income) }),
        el('td', { className: 'num', text: currency(item.expenditure) }),
        el('td', { className: 'num', text: currency(item.savings) }),
        el('td', { className: 'num', text: item.savingsRate === null ? 'N/A' : Artha.utils.formatPercent(item.savingsRate) }),
        el('td', { className: 'num', text: item.expenseChange === null
          ? 'N/A'
          : (item.expenseChange > 0 ? '+' : '') + currency(item.expenseChange) + (item.expenseChangePercent === null ? '' : ' (' + (item.expenseChangePercent > 0 ? '+' : '') + Artha.utils.formatPercent(item.expenseChangePercent) + ')') })
      ].forEach(function (cell) { row.appendChild(cell); });
      body.appendChild(row);
    });
  }

  function renderCategoryRelationships(rows) {
    var body = document.getElementById('category-relationships');
    reset(body);
    document.getElementById('category-relationships-empty').hidden = rows.length > 0;
    rows.forEach(function (item) {
      var budgetText = item.budgets.length
        ? item.budgets.map(function (budget) {
          return budget.period + ': ' + (budget.actual === null ? 'actual unavailable' : currency(budget.actual) + ' / ' + currency(budget.budget));
        }).join('; ')
        : 'No budget';
      var row = el('tr');
      [
        el('td', { text: item.category }),
        el('td', { className: 'num', text: currency(item.income) }),
        el('td', { className: 'num', text: currency(item.expenditure) }),
        el('td', { className: 'num', text: currency(item.savings) }),
        el('td', { text: budgetText }),
        el('td', { className: 'num', text: String(item.transactionCount) })
      ].forEach(function (cell) { row.appendChild(cell); });
      body.appendChild(row);
    });
  }

  async function loadAnalytics() {
    var loading = document.getElementById('analytics-loading');
    var error = document.getElementById('analytics-error');
    var content = document.getElementById('analytics-content');
    loading.hidden = false;
    error.hidden = true;
    content.hidden = true;
    try {
      var asOf = document.getElementById('analytics-as-of').value;
      var response = await Artha.api.get('/analytics' + (asOf ? '?asOf=' + encodeURIComponent(asOf) : ''));
      var data = response.data;
      renderStats(data);
      renderMonthlyTable(data.monthly);
      renderCategoryRelationships(data.multivariate.categoryRelationships);
      content.hidden = false;
      document.getElementById('analytics-empty').hidden = data.overview.transactionCount !== 0;
      renderCharts(data);
    } catch (err) {
      content.hidden = true;
      document.getElementById('analytics-error-message').textContent = err.message;
      error.hidden = false;
    } finally {
      loading.hidden = true;
    }
  }

  document.getElementById('analytics-as-of').value = new Date().toISOString().slice(0, 10);
  document.getElementById('analytics-period-form').addEventListener('submit', function (event) {
    event.preventDefault();
    loadAnalytics();
  });
  document.getElementById('analytics-retry').addEventListener('click', loadAnalytics);
  Artha.layout.start('analytics', loadAnalytics);
})();