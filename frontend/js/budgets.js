/* Budgets page: cards with calculated spending/utilization, plus add/edit/delete. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = Artha.dom.el;
  var fmt = Artha.utils.formatINR;
  var FIELDS = ['category', 'amount', 'period'];
  var STATUS_BADGE = { ok: ['badge--ok', 'On track'], warning: ['badge--warn', 'Over 80%'], critical: ['badge--bad', 'Over 90%'], over: ['badge--bad', 'Over budget'] };
  var PERIOD_LABEL = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
  var editingId = null;

  function periodText(b) {
    var end = new Date(new Date(b.periodEnd).getTime() - 1); // periodEnd is exclusive
    return PERIOD_LABEL[b.period] + ' · ' + Artha.utils.formatDate(b.periodStart) + ' to ' + Artha.utils.formatDate(end);
  }

  function card(b) {
    var badge = STATUS_BADGE[b.status];
    var fill = el('div', { className: 'progress__bar progress__bar--' + b.status });
    fill.style.width = Math.min(b.utilization, 100) + '%';
    var bar = el('div', { className: 'progress', attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(b.utilization, 100)), 'aria-label': b.category + ' budget used' } }, fill);

    return el('article', { className: 'card item-card' },
      el('div', { className: 'item-card__head' },
        el('h2', { className: 'item-card__title', text: b.category }),
        el('span', { className: 'badge ' + badge[0], text: badge[1] })),
      el('p', { className: 'item-card__meta', text: periodText(b) }),
      bar,
      el('dl', { className: 'facts' },
        el('dt', { text: 'Spent' }), el('dd', { text: fmt(b.spent) }),
        el('dt', { text: 'Budget' }), el('dd', { text: fmt(b.amount) }),
        el('dt', { text: 'Utilization' }), el('dd', { text: Artha.utils.formatPercent(b.utilization, 1) }),
        el('dt', { text: b.remaining < 0 ? 'Over by' : 'Remaining' }), el('dd', { className: b.remaining < 0 ? 'is-expense' : '', text: fmt(Math.abs(b.remaining)) })),
      b.alert ? el('p', { className: 'item-card__alert item-card__alert--' + b.status, text: b.alert }) : null,
      el('div', { className: 'btn-row' },
        el('button', { className: 'btn btn--sm', type: 'button', text: 'Edit', on: { click: function () { openDialog(b); } } }),
        el('button', { className: 'btn btn--sm btn--danger', type: 'button', text: 'Delete', on: { click: function () { remove(b); } } })));
  }

  async function load() {
    $('list-error').textContent = '';
    try {
      var asOf = $('as-of').value;
      var res = await Artha.api.get('/budgets' + (asOf ? '?asOf=' + encodeURIComponent(asOf) : ''));
      var d = res.data;
      $('sum-count').textContent = d.summary.count;
      $('sum-warning').textContent = d.summary.warning;
      $('sum-over').textContent = d.summary.overBudget;
      var grid = Artha.dom.clear($('budget-grid'));
      d.items.forEach(function (b) { grid.appendChild(card(b)); });
      $('budget-empty').hidden = d.items.length > 0;
    } catch (err) {
      $('list-error').textContent = err.message;
    }
  }

  function openDialog(b) {
    editingId = b ? b._id : null;
    Artha.dom.clearFieldErrors('b', FIELDS);
    $('b-dialog-title').textContent = b ? 'Edit budget' : 'Add budget';
    if (b) $('b-category').value = b.category;
    $('b-amount').value = b ? b.amount : '';
    $('b-period').value = b ? b.period : 'monthly';
    $('b-dialog').showModal();
    $('b-amount').focus();
  }

  async function save(e) {
    e.preventDefault();
    Artha.dom.clearFieldErrors('b', FIELDS);
    var amount = $('b-amount').value;
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      Artha.dom.setFieldError('b', 'amount', 'Enter an amount greater than zero (max 2 decimals)');
      return;
    }
    var body = { category: $('b-category').value, amount: Number(amount), period: $('b-period').value };
    var btn = $('b-save');
    btn.disabled = true;
    try {
      if (editingId) await Artha.api.put('/budgets/' + editingId, body);
      else await Artha.api.post('/budgets', body);
      $('b-dialog').close();
      Artha.dom.toast(editingId ? 'Budget updated' : 'Budget added');
      await load();
    } catch (err) {
      Artha.dom.showServerErrors('b', FIELDS, err);
    } finally {
      btn.disabled = false;
    }
  }

  async function remove(b) {
    if (!window.confirm('Delete the ' + b.period + ' ' + b.category + ' budget?')) return;
    try {
      await Artha.api.del('/budgets/' + b._id);
      Artha.dom.toast('Budget deleted');
      await load();
    } catch (err) {
      Artha.dom.toast(err.message, true);
    }
  }

  async function init() {
    var cats = (await Artha.api.get('/transactions/categories')).data.expense;
    var select = $('b-category');
    cats.forEach(function (c) { select.appendChild(el('option', { value: c, text: c })); });

    $('add-btn').addEventListener('click', function () { openDialog(null); });
    $('b-cancel').addEventListener('click', function () { $('b-dialog').close(); });
    $('b-form').addEventListener('submit', save);
    $('as-of').addEventListener('change', load);
    $('today-btn').addEventListener('click', function () { $('as-of').value = ''; load(); });
    await load();
  }

  Artha.layout.start('budgets', init);
})();
