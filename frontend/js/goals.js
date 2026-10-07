/* Goals page: cards with calculated remaining/estimate/on-track, plus add/edit/contribute/delete. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = Artha.dom.el;
  var fmt = Artha.utils.formatINR;
  var FIELDS = ['name', 'targetAmount', 'currentAmount', 'monthlyContribution', 'targetDate'];
  var editingId = null;
  var contributingId = null;

  function statusBadge(g) {
    if (g.status === 'completed') return el('span', { className: 'badge badge--ok', text: 'Completed' });
    if (g.onTrack === true) return el('span', { className: 'badge badge--ok', text: 'On track' });
    if (g.onTrack === false) return el('span', { className: 'badge badge--bad', text: 'Behind' });
    return el('span', { className: 'badge', text: 'No target date' });
  }

  function months(n) { return n === 1 ? '1 month' : n + ' months'; }

  function card(g) {
    var fill = el('div', { className: 'progress__bar progress__bar--' + (g.status === 'completed' ? 'ok' : 'primary') });
    fill.style.width = g.progress + '%';
    var bar = el('div', { className: 'progress', attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(g.progress), 'aria-label': g.name + ' progress' } }, fill);

    var facts = el('dl', { className: 'facts' },
      el('dt', { text: 'Saved' }), el('dd', { text: fmt(g.currentAmount) + ' of ' + fmt(g.targetAmount) }),
      el('dt', { text: 'Progress' }), el('dd', { text: Artha.utils.formatPercent(g.progress, 1) }),
      el('dt', { text: 'Remaining' }), el('dd', { text: fmt(g.remaining) }),
      el('dt', { text: 'Monthly contribution' }), el('dd', { text: fmt(g.monthlyContribution) }),
      el('dt', { text: 'Estimated time' }), el('dd', { text: g.estimatedMonths === null ? 'Set a monthly contribution' : (g.estimatedMonths === 0 ? 'Done' : months(g.estimatedMonths)) }));
    if (g.projectedCompletionDate && g.status !== 'completed') {
      facts.appendChild(el('dt', { text: 'Projected finish' }));
      facts.appendChild(el('dd', { text: Artha.utils.formatDate(g.projectedCompletionDate) }));
    }
    if (g.targetDate) {
      facts.appendChild(el('dt', { text: 'Target date' }));
      facts.appendChild(el('dd', { text: Artha.utils.formatDate(g.targetDate) }));
      if (g.status !== 'completed') {
        facts.appendChild(el('dt', { text: 'Needed per month' }));
        facts.appendChild(el('dd', { text: fmt(g.requiredMonthly) }));
        if (g.contributionGap > 0) {
          facts.appendChild(el('dt', { text: 'Monthly shortfall' }));
          facts.appendChild(el('dd', { className: 'is-expense', text: fmt(g.contributionGap) }));
        }
      }
    }

    return el('article', { className: 'card item-card' },
      el('div', { className: 'item-card__head' }, el('h2', { className: 'item-card__title', text: g.name }), statusBadge(g)),
      bar, facts,
      el('div', { className: 'btn-row' },
        g.status === 'active' ? el('button', { className: 'btn btn--sm btn--primary', type: 'button', text: 'Add money', on: { click: function () { openContribute(g); } } }) : null,
        el('button', { className: 'btn btn--sm', type: 'button', text: 'Edit', on: { click: function () { openDialog(g); } } }),
        el('button', { className: 'btn btn--sm btn--danger', type: 'button', text: 'Delete', on: { click: function () { remove(g); } } })));
  }

  async function load() {
    $('list-error').textContent = '';
    try {
      var d = (await Artha.api.get('/goals')).data;
      $('sum-count').textContent = d.summary.count;
      $('sum-active').textContent = d.summary.active;
      $('sum-completed').textContent = d.summary.completed;
      var grid = Artha.dom.clear($('goal-grid'));
      d.items.forEach(function (g) { grid.appendChild(card(g)); });
      $('goal-empty').hidden = d.items.length > 0;
    } catch (err) {
      $('list-error').textContent = err.message;
    }
  }

  /* ---------- add / edit ---------- */
  function openDialog(g) {
    editingId = g ? g._id : null;
    Artha.dom.clearFieldErrors('g', FIELDS);
    $('g-dialog-title').textContent = g ? 'Edit goal' : 'Add goal';
    $('g-name').value = g ? g.name : '';
    $('g-targetAmount').value = g ? g.targetAmount : '';
    $('g-currentAmount').value = g ? g.currentAmount : '';
    $('g-monthlyContribution').value = g ? g.monthlyContribution : '';
    $('g-targetDate').value = g && g.targetDate ? String(g.targetDate).slice(0, 10) : '';
    $('g-dialog').showModal();
    $('g-name').focus();
  }

  var MONEY_RE = /^\d+(\.\d{1,2})?$/;
  function validateGoal() {
    var errors = {};
    var name = $('g-name').value.trim();
    if (name.length < 2 || name.length > 80) errors.name = 'Name must be between 2 and 80 characters';
    var target = $('g-targetAmount').value;
    if (!MONEY_RE.test(target) || Number(target) < 1) errors.targetAmount = 'Enter a target of at least 1 (max 2 decimals)';
    ['currentAmount', 'monthlyContribution'].forEach(function (f) {
      var v = $('g-' + f).value;
      if (v !== '' && !MONEY_RE.test(v)) errors[f] = 'Enter zero or a positive amount (max 2 decimals)';
    });
    Object.keys(errors).forEach(function (f) { Artha.dom.setFieldError('g', f, errors[f]); });
    return Object.keys(errors).length === 0;
  }

  async function save(e) {
    e.preventDefault();
    Artha.dom.clearFieldErrors('g', FIELDS);
    if (!validateGoal()) return;
    var body = {
      name: $('g-name').value.trim(),
      targetAmount: Number($('g-targetAmount').value),
      currentAmount: Number($('g-currentAmount').value || 0),
      monthlyContribution: Number($('g-monthlyContribution').value || 0),
      targetDate: $('g-targetDate').value || null,
    };
    var btn = $('g-save');
    btn.disabled = true;
    try {
      if (editingId) await Artha.api.put('/goals/' + editingId, body);
      else await Artha.api.post('/goals', body);
      $('g-dialog').close();
      Artha.dom.toast(editingId ? 'Goal updated' : 'Goal added');
      await load();
    } catch (err) {
      Artha.dom.showServerErrors('g', FIELDS, err);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- contribute ---------- */
  function openContribute(g) {
    contributingId = g._id;
    Artha.dom.clearFieldErrors('c', ['amount']);
    $('c-dialog-title').textContent = 'Add money to "' + g.name + '"'; // textContent: safe for user text
    $('c-amount').value = g.monthlyContribution > 0 ? g.monthlyContribution : '';
    $('c-dialog').showModal();
    $('c-amount').focus();
  }

  async function contribute(e) {
    e.preventDefault();
    Artha.dom.clearFieldErrors('c', ['amount']);
    var v = $('c-amount').value;
    if (!MONEY_RE.test(v) || Number(v) <= 0) { Artha.dom.setFieldError('c', 'amount', 'Enter an amount greater than zero (max 2 decimals)'); return; }
    var btn = $('c-save');
    btn.disabled = true;
    try {
      await Artha.api.post('/goals/' + contributingId + '/contributions', { amount: Number(v) });
      $('c-dialog').close();
      Artha.dom.toast('Contribution added');
      await load();
    } catch (err) {
      Artha.dom.showServerErrors('c', ['amount'], err);
    } finally {
      btn.disabled = false;
    }
  }

  async function remove(g) {
    if (!window.confirm('Delete the goal "' + g.name + '"?')) return;
    try {
      await Artha.api.del('/goals/' + g._id);
      Artha.dom.toast('Goal deleted');
      await load();
    } catch (err) {
      Artha.dom.toast(err.message, true);
    }
  }

  async function init() {
    $('add-btn').addEventListener('click', function () { openDialog(null); });
    $('g-cancel').addEventListener('click', function () { $('g-dialog').close(); });
    $('g-form').addEventListener('submit', save);
    $('c-cancel').addEventListener('click', function () { $('c-dialog').close(); });
    $('c-form').addEventListener('submit', contribute);
    await load();
  }

  Artha.layout.start('goals', init);
})();
