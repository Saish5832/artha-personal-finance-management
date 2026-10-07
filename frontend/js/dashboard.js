(function () {
  var el = Artha.dom.el;
  var charts = [];
  var currency = Artha.utils.formatINR;

  function stat(label, value, detail, modifier) {
    var node = el('article', { className: 'dashboard-stat' + (modifier ? ' dashboard-stat--' + modifier : '') });
    node.appendChild(el('p', { className: 'dashboard-stat__label', text: label }));
    node.appendChild(el('p', { className: 'dashboard-stat__value', text: value }));
    node.appendChild(el('p', { className: 'dashboard-stat__detail', text: detail || '' }));
    return node;
  }

  function signedMoney(value) {
    return (value > 0 ? '+' : value < 0 ? '-' : '') + currency(Math.abs(value));
  }

  function renderSummary(summary) {
    var grid = document.getElementById('summary-grid');
    Artha.dom.clear(grid);
    var change = summary.monthlyExpenseChange;
    var changeValue = change.percent === null ? 'No baseline' : Artha.utils.formatPercent(change.percent);
    var highest = summary.highestSpendingCategory;
    [
      stat('Total income', currency(summary.totalIncome), 'All recorded income', 'income'),
      stat('Total expenses', currency(summary.totalExpenses), 'All recorded spending', 'expense'),
      stat('Net savings', currency(summary.netSavings), 'Income minus expenses', summary.netSavings < 0 ? 'expense' : 'income'),
      stat('Savings rate', summary.savingsRate === null ? 'N/A' : Artha.utils.formatPercent(summary.savingsRate), 'Net savings as a share of income'),
      stat('Budget utilization', Artha.utils.formatPercent(summary.budgetUtilization), summary.overBudgetCount + ' over budget'),
      stat('Active goals', String(summary.activeGoals), summary.activeGoals === 1 ? 'Savings goal in progress' : 'Savings goals in progress'),
      stat('Transactions', String(summary.transactionCount), 'All recorded transactions'),
      stat('Highest spending category', highest ? highest.category : 'None', highest ? currency(highest.amount) + ' total' : 'No expenses recorded'),
      stat('Over-budget count', String(summary.overBudgetCount), 'Budgets at or above their limit', summary.overBudgetCount ? 'expense' : ''),
      stat('Monthly expense change', changeValue, signedMoney(change.amount) + ' vs previous month', change.percent > 0 ? 'expense' : change.percent < 0 ? 'income' : '')
    ].forEach(function (card) { grid.appendChild(card); });
  }

  function renderHealth(health) {
    var panel = document.querySelector('.health-panel');
    panel.classList.toggle('health-panel--attention', health.status === 'attention');
    panel.classList.toggle('health-panel--empty', health.status === 'no_data');
    document.getElementById('health-title').textContent = health.title;
    var list = document.getElementById('health-details');
    Artha.dom.clear(list);
    health.details.forEach(function (detail) { list.appendChild(el('li', { text: detail })); });
  }

  function chartColors() {
    return ['#087f5b', '#d94841', '#3266c5', '#d18a18', '#168b9a', '#7c5caa', '#718096'];
  }

  function lineOptions() {
    var text = getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim();
    var border = getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim();
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: text, usePointStyle: true, boxWidth: 8 } } },
      scales: {
        x: { ticks: { color: text }, grid: { color: border } },
        y: { beginAtZero: true, ticks: { color: text }, grid: { color: border } }
      }
    };
  }

  function drawChart(id, type, datasets, labels, options) {
    var canvas = document.getElementById(id);
    charts.push(new Chart(canvas, {
      type: type,
      data: { labels: labels, datasets: datasets },
      options: Object.assign(lineOptions(), options || {})
    }));
  }

  function renderCharts(data) {
    charts.forEach(function (chart) { chart.destroy(); });
    charts = [];
    var palette = chartColors();
    var incomeExpense = data.monthlyIncomeExpense;
    drawChart('chart-income-expense', 'bar', [
      { label: 'Income', data: incomeExpense.income, backgroundColor: '#087f5b' },
      { label: 'Expenses', data: incomeExpense.expenses, backgroundColor: '#d94841' }
    ], incomeExpense.labels);

    drawChart('chart-expense-trend', 'line', [{
      label: 'Expenses', data: data.monthlyExpenseTrend.expenses,
      borderColor: '#d94841', backgroundColor: 'rgba(217, 72, 65, 0.12)', fill: true, tension: 0.28
    }], data.monthlyExpenseTrend.labels, { plugins: { legend: { display: false } } });

    var category = data.expenseByCategory;
    document.getElementById('chart-category').parentNode.hidden = category.labels.length === 0;
    document.getElementById('chart-category-empty').hidden = category.labels.length !== 0;
    if (category.labels.length) {
      drawChart('chart-category', 'doughnut', [{ data: category.values, backgroundColor: palette, borderWidth: 0 }], category.labels, {
        cutout: '62%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14 } } }
      });
    }

    var budget = data.budgetVsActual;
    document.getElementById('chart-budget').parentNode.hidden = budget.labels.length === 0;
    document.getElementById('chart-budget-empty').hidden = budget.labels.length !== 0;
    if (budget.labels.length) {
      drawChart('chart-budget', 'bar', [
        { label: 'Budget', data: budget.budget, backgroundColor: '#3266c5' },
        { label: 'Actual', data: budget.actual, backgroundColor: '#d18a18' }
      ], budget.labels, { indexAxis: budget.labels.length > 4 ? 'y' : 'x' });
    }

    drawChart('chart-savings', 'line', [{
      label: 'Net savings', data: data.savingsTrend.values,
      borderColor: '#168b9a', backgroundColor: 'rgba(22, 139, 154, 0.12)', fill: true, tension: 0.28
    }], data.savingsTrend.labels, { plugins: { legend: { display: false } } });
  }

  function renderInsights(alerts) {
    var panel = document.getElementById('dashboard-insights');
    var empty = document.getElementById('dashboard-insights-empty');
    Artha.dom.clear(panel);
    if (!alerts.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    alerts.slice(0, 4).forEach(function (alert) {
      var card = el('article', { className: 'alert-card alert-card--' + String(alert.severity).toLowerCase() });
      var header = el('div', { className: 'alert-card__header' });
      header.appendChild(el('h3', { className: 'alert-card__title', text: alert.recommendation }));
      header.appendChild(el('span', { className: 'alert-card__badge', text: alert.severity }));
      card.appendChild(header);
      card.appendChild(el('p', { className: 'alert-card__meta', text: (alert.category || 'Overall') + ' • ' + alert.ruleName }));
      card.appendChild(el('p', { className: 'alert-card__body', text: alert.reason }));
      panel.appendChild(card);
    });
  }

  function renderTransactions(transactions) {
    var tbody = document.getElementById('recent-transactions');
    Artha.dom.clear(tbody);
    if (!transactions.length) {
      var empty = el('tr');
      empty.appendChild(el('td', { className: 'empty', text: 'No transactions recorded yet.', attrs: { colspan: 5 } }));
      tbody.appendChild(empty);
      return;
    }
    transactions.forEach(function (transaction) {
      var row = el('tr');
      row.appendChild(el('td', { text: Artha.utils.formatDate(transaction.date) }));
      row.appendChild(el('td', { text: transaction.description || '—' }));
      row.appendChild(el('td', { text: transaction.category }));
      row.appendChild(el('td', {}, el('span', {
        className: 'transaction-type transaction-type--' + transaction.type,
        text: transaction.type
      })));
      row.appendChild(el('td', {
        className: 'num ' + (transaction.type === 'income' ? 'is-income' : 'is-expense'),
        text: (transaction.type === 'income' ? '+' : '-') + currency(transaction.amount)
      }));
      tbody.appendChild(row);
    });
  }

  async function loadDashboard() {
    var loading = document.getElementById('dashboard-loading');
    var error = document.getElementById('dashboard-error');
    var content = document.getElementById('dashboard-data');
    loading.hidden = false;
    error.hidden = true;
    content.hidden = true;
    try {
      var response = await Artha.api.get('/dashboard');
      var data = response.data;
      document.getElementById('dashboard-as-of').textContent = 'As of ' + Artha.utils.formatDate(data.asOf);
      renderSummary(data.summary);
      renderHealth(data.summary.financialHealth);
      renderTransactions(data.recentTransactions);
      try {
        var alertsResponse = await Artha.api.get('/alerts');
        renderInsights(alertsResponse.data.alerts || []);
      } catch (insightErr) {
        renderInsights([]);
      }
      document.getElementById('empty-activity').hidden = data.summary.transactionCount !== 0;
      content.hidden = false;
      renderCharts(data.charts);
    } catch (err) {
      content.hidden = true;
      document.getElementById('dashboard-error-message').textContent = err.message;
      error.hidden = false;
    } finally {
      loading.hidden = true;
    }
  }

  document.getElementById('dashboard-retry').addEventListener('click', loadDashboard);
  Artha.layout.start('dashboard', function (user) {
    document.getElementById('account-name').textContent = user.name;   // textContent: user text is never parsed as HTML
    return loadDashboard();
  });
})();
