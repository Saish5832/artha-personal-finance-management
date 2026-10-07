(function () {
  var el = Artha.dom.el;
  var state = { filter: 'ALL', alerts: [] };

  function formatActual(alert) {
    if (typeof alert.actualValue === 'number') {
      if (alert.ruleId === 'EXPENSES_EXCEED_INCOME' || alert.ruleId === 'SAVINGS_GOAL_SHORTFALL' || alert.ruleId === 'GOAL_CONTRIBUTION_GAP' || alert.ruleId === 'LOW_REMAINING_BUDGET') {
        return Artha.utils.formatINR(alert.actualValue);
      }
      if (alert.ruleId === 'HIGH_BUDGET_UTILIZATION' || alert.ruleId === 'CATEGORY_CONCENTRATION' || alert.ruleId === 'LOW_SAVINGS_RATE' || alert.ruleId === 'MONTHLY_SPENDING_SPIKE') {
        return alert.actualValue + '%';
      }
      return String(alert.actualValue);
    }
    return alert.actualValue || 'N/A';
  }

  function renderSummary(summary) {
    document.getElementById('insights-total').textContent = String(summary.totalAlerts || 0);
    document.getElementById('insights-critical').textContent = String(summary.critical || 0);
    document.getElementById('insights-warning').textContent = String(summary.warning || 0);
    document.getElementById('insights-info').textContent = String(summary.info || 0);
  }

  function renderAlerts() {
    var list = document.getElementById('alerts-list');
    var empty = document.getElementById('alerts-empty');
    Artha.dom.clear(list);
    var visible = state.filter === 'ALL' ? state.alerts : state.alerts.filter(function (alert) { return alert.severity === state.filter; });
    if (!visible.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    visible.forEach(function (alert) {
      var card = el('article', { className: 'alert-card alert-card--' + String(alert.severity).toLowerCase() });
      var head = el('div', { className: 'alert-card__header' });
      head.appendChild(el('h3', { className: 'alert-card__title', text: alert.recommendation }));
      head.appendChild(el('span', { className: 'alert-card__badge', text: alert.severity }));
      card.appendChild(head);
      card.appendChild(el('p', { className: 'alert-card__meta', text: ((alert.category || 'Overall') + ' • ' + alert.ruleName) }));

      var sectionCondition = el('div', { className: 'alert-card__section' });
      sectionCondition.appendChild(el('strong', { text: 'Condition' }));
      sectionCondition.appendChild(el('p', { className: 'alert-card__body', text: alert.condition }));
      card.appendChild(sectionCondition);

      var sectionActual = el('div', { className: 'alert-card__section' });
      sectionActual.appendChild(el('strong', { text: 'Actual' }));
      sectionActual.appendChild(el('p', { className: 'alert-card__body', text: formatActual(alert) }));
      card.appendChild(sectionActual);

      var sectionReason = el('div', { className: 'alert-card__section' });
      sectionReason.appendChild(el('strong', { text: 'Reason' }));
      sectionReason.appendChild(el('p', { className: 'alert-card__body', text: alert.reason }));
      card.appendChild(sectionReason);

      list.appendChild(card);
    });
  }

  async function loadAlerts() {
    var loading = document.getElementById('alerts-loading');
    var error = document.getElementById('alerts-error');
    var content = document.getElementById('alerts-content');
    loading.hidden = false;
    error.hidden = true;
    content.hidden = true;
    try {
      var response = await Artha.api.get('/alerts');
      var data = response.data || {};
      document.getElementById('alerts-as-of').textContent = 'As of ' + Artha.utils.formatDate(data.asOf);
      state.alerts = data.alerts || [];
      renderSummary(data.summary || { totalAlerts: 0, critical: 0, warning: 0, info: 0 });
      renderAlerts();
      content.hidden = false;
    } catch (err) {
      document.getElementById('alerts-error-message').textContent = err.message;
      error.hidden = false;
    } finally {
      loading.hidden = true;
    }
  }

  document.getElementById('alerts-retry').addEventListener('click', loadAlerts);
  document.querySelectorAll('.filter-btn').forEach(function (button) {
    button.addEventListener('click', function () {
      state.filter = button.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(function (btn) { btn.classList.toggle('is-active', btn === button); });
      renderAlerts();
    });
  });

  Artha.layout.start('alerts', function () {
    return loadAlerts();
  });
})();
