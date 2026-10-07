(function () {
  var charts = [];
  var currency = Artha.utils.formatINR;
  var minimumMessage = 'Regression analysis needs at least 3 months of historical data. Continue recording transactions to unlock this analysis.';

  function formatStrength(rSquared) {
    if (rSquared >= 0.75) return 'Strong';
    if (rSquared >= 0.5) return 'Moderate';
    return 'Weak';
  }

  function setTechnical(prefix, result) {
    document.getElementById(prefix + '-equation').textContent = result.equation;
    document.getElementById(prefix + '-coefficient').textContent = String(result.coefficient);
    document.getElementById(prefix + '-intercept').textContent = currency(result.intercept);
    document.getElementById(prefix + '-r2').textContent = result.rSquared.toFixed(4);
    document.getElementById(prefix + '-observations').textContent = result.monthsAnalyzed + ' months';
    document.getElementById(prefix + '-details').hidden = false;
  }

  function chartStyle() {
    var text = getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim();
    var border = getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: text, usePointStyle: true, boxWidth: 8 } } },
      scales: {
        x: { ticks: { color: text }, grid: { color: border } },
        y: { ticks: { color: text, callback: function (value) { return currency(value); } }, grid: { color: border } }
      }
    };
  }

  function destroyCharts() {
    charts.forEach(function (chart) { chart.destroy(); });
    charts = [];
  }

  function renderExpenditure(result) {
    var valid = result.status === 'ok';
    document.getElementById('expenditure-status').textContent = valid ? result.trend.replace('_', ' ') : 'Insufficient data';
    document.getElementById('expenditure-analysis').hidden = !valid;
    document.getElementById('expenditure-insufficient').hidden = valid;
    document.getElementById('expenditure-details').hidden = !valid;
    if (!valid) {
      document.getElementById('expenditure-insufficient').textContent = result.interpretation || minimumMessage;
      return;
    }
    document.getElementById('expenditure-months').textContent = result.monthsAnalyzed;
    document.getElementById('expenditure-change').textContent = (result.averageMonthlyChange > 0 ? '+' : result.averageMonthlyChange < 0 ? '-' : '') + currency(Math.abs(result.averageMonthlyChange)) + '/month';
    document.getElementById('expenditure-strength').textContent = formatStrength(result.rSquared);
    document.getElementById('expenditure-interpretation').textContent = result.interpretation;
    setTechnical('expenditure', result);

    charts.push(new Chart(document.getElementById('expenditure-chart'), {
      type: 'line',
      data: {
        labels: result.monthlyData.map(function (row) { return row.month; }),
        datasets: [
          { label: 'Actual expenditure', data: result.monthlyData.map(function (row) { return row.expenditure; }), borderColor: '#d94841', backgroundColor: 'rgba(217, 72, 65, 0.1)', fill: false, tension: 0.2 },
          { label: 'Historical regression trend', data: result.fittedValues, borderColor: '#3266c5', borderDash: [6, 4], pointRadius: 0, fill: false }
        ]
      },
      options: chartStyle()
    }));
  }

  function renderIncomeSavings(result) {
    var valid = result.status === 'ok';
    document.getElementById('income-savings-status').textContent = valid ? result.relationship : 'Insufficient data';
    document.getElementById('income-savings-analysis').hidden = !valid;
    document.getElementById('income-savings-insufficient').hidden = valid;
    document.getElementById('income-savings-details').hidden = !valid;
    if (!valid) {
      document.getElementById('income-savings-insufficient').textContent = result.interpretation || minimumMessage;
      return;
    }
    document.getElementById('income-savings-relationship').textContent = result.relationship;
    document.getElementById('income-savings-months').textContent = result.monthsAnalyzed;
    document.getElementById('income-savings-strength').textContent = formatStrength(result.rSquared);
    document.getElementById('income-savings-interpretation').textContent = result.interpretation;
    setTechnical('income-savings', result);

    var points = result.monthlyData.map(function (row, index) {
      return { x: row.income, y: row.savings, fitted: result.fittedValues[index], month: row.month };
    });
    var fit = points.map(function (point) { return { x: point.x, y: point.fitted }; })
      .sort(function (left, right) { return left.x - right.x; });
    charts.push(new Chart(document.getElementById('income-savings-chart'), {
      type: 'scatter',
      data: {
        datasets: [
          { type: 'scatter', label: 'Monthly observations', data: points, backgroundColor: '#168b9a', pointRadius: 5 },
          { type: 'line', label: 'Historical regression line', data: fit, borderColor: '#3266c5', borderDash: [6, 4], pointRadius: 0, showLine: true }
        ]
      },
      options: Object.assign(chartStyle(), {
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Monthly Income (₹)' }, ticks: { callback: function (value) { return currency(value); } } },
          y: { title: { display: true, text: 'Monthly Savings (₹)' }, ticks: { callback: function (value) { return currency(value); } } }
        },
        plugins: { tooltip: { callbacks: { title: function (items) { return items[0].raw.month || 'Regression line'; } } } }
      })
    }));
  }

  function renderCurrentComparison(result) {
    var section = document.getElementById('current-comparison');
    var comparison = result.currentVsTrend;
    section.hidden = !comparison;
    if (!comparison) return;
    document.getElementById('current-status').textContent = comparison.status.replace('_', ' ');
    document.getElementById('current-actual').textContent = currency(comparison.actual);
    document.getElementById('current-trend').textContent = currency(comparison.trendValue);
    document.getElementById('current-difference').textContent = (comparison.difference > 0 ? '+' : comparison.difference < 0 ? '-' : '') + currency(Math.abs(comparison.difference)) + (comparison.percentageDifference === null ? '' : ' (' + Artha.utils.formatPercent(comparison.percentageDifference) + ')');
    document.getElementById('current-interpretation').textContent = comparison.interpretation;
  }

  async function loadRegression() {
    var loading = document.getElementById('regression-loading');
    var error = document.getElementById('regression-error');
    var content = document.getElementById('regression-content');
    loading.hidden = false;
    error.hidden = true;
    content.hidden = true;
    destroyCharts();
    try {
      var asOf = document.getElementById('regression-as-of').value;
      var response = await Artha.api.get('/regression' + (asOf ? '?asOf=' + encodeURIComponent(asOf) : ''));
      var data = response.data;
      content.hidden = false;
      renderExpenditure(data.expenditureTrend);
      renderIncomeSavings(data.incomeSavings);
      renderCurrentComparison(data.expenditureTrend);
      var hasInsufficientMonths = data.expenditureTrend.monthsAnalyzed < 3;
      document.getElementById('regression-insufficient').hidden = !hasInsufficientMonths;
      document.getElementById('regression-insufficient-message').textContent = minimumMessage;
    } catch (err) {
      content.hidden = true;
      document.getElementById('regression-error-message').textContent = err.message;
      error.hidden = false;
    } finally {
      loading.hidden = true;
    }
  }

  document.getElementById('regression-as-of').value = new Date().toISOString().slice(0, 10);
  document.getElementById('regression-period-form').addEventListener('submit', function (event) {
    event.preventDefault();
    loadRegression();
  });
  document.getElementById('regression-retry').addEventListener('click', loadRegression);
  Artha.layout.start('regression', loadRegression);
})();