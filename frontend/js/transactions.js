/* Transactions page: list/filter/search/paginate, add, edit, delete. All data comes from /api/transactions. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var el = Artha.dom.el;
  var fmt = Artha.utils.formatINR;
  var FIELDS = ['type', 'category', 'amount', 'date', 'description'];
  var LIMIT = 10;

  var categories = { income: [], expense: [] };
  var state = { page: 1, pages: 1 };
  var editingId = null;

  /* ---------- helpers ---------- */
  function selectedType() { return document.querySelector('#tx-form input[name="type"]:checked').value; }

  function fillOptions(select, values, withAll) {
    Artha.dom.clear(select);
    if (withAll) select.appendChild(el('option', { value: '', text: 'All' }));
    values.forEach(function (v) { select.appendChild(el('option', { value: v, text: v })); });
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  /* ---------- listing ---------- */
  function buildQuery() {
    var p = [];
    function add(k, v) { if (v !== '' && v != null) p.push(k + '=' + encodeURIComponent(v)); }
    add('q', $('f-q').value.trim());
    add('type', $('f-type').value);
    add('category', $('f-category').value);
    add('from', $('f-from').value);
    add('to', $('f-to').value);
    add('minAmount', $('f-min').value);
    add('maxAmount', $('f-max').value);
    var sort = $('f-sort').value.split(':');
    add('sortBy', sort[0]);
    add('order', sort[1]);
    add('page', state.page);
    add('limit', LIMIT);
    return p.join('&');
  }

  function renderRows(items) {
    var body = Artha.dom.clear($('tx-body'));
    items.forEach(function (t) {
      var isIncome = t.type === 'income';
      body.appendChild(el('tr', {},
        el('td', { text: Artha.utils.formatDate(t.date) }),
        el('td', {}, el('span', { className: 'badge ' + (isIncome ? 'badge--income' : 'badge--expense'), text: isIncome ? 'Income' : 'Expense' })),
        el('td', { text: t.category }),
        el('td', { text: t.description || '-' }),
        el('td', { className: 'num ' + (isIncome ? 'is-income' : 'is-expense'), text: (isIncome ? '+ ' : '- ') + fmt(t.amount) }),
        el('td', { className: 'actions' },
          el('div', { className: 'btn-row' },
            el('button', { className: 'btn btn--sm', type: 'button', text: 'Edit', on: { click: function () { openDialog(t); } } }),
            el('button', { className: 'btn btn--sm btn--danger', type: 'button', text: 'Delete', on: { click: function () { remove(t); } } })))
      ));
    });
  }

  async function load() {
    $('filter-error').textContent = '';
    try {
      var res = await Artha.api.get('/transactions?' + buildQuery());
      var d = res.data;
      state.pages = d.pagination.pages;
      if (state.page > state.pages) { state.page = state.pages; return load(); }

      $('total-income').textContent = fmt(d.totals.income);
      $('total-expense').textContent = fmt(d.totals.expense);
      var net = $('total-net');
      net.textContent = fmt(d.totals.net);
      net.className = 'stat__value ' + (d.totals.net >= 0 ? 'is-income' : 'is-expense');

      renderRows(d.items);
      var empty = $('tx-empty');
      empty.hidden = d.items.length > 0;
      empty.textContent = d.pagination.total === 0 && !hasFilters() ? 'No transactions yet. Add your first one with the button above.' : 'No transactions match these filters.';
      $('pager-info').textContent = d.pagination.total + ' transaction' + (d.pagination.total === 1 ? '' : 's') + ' · page ' + d.pagination.page + ' of ' + d.pagination.pages;
      $('prev-btn').disabled = state.page <= 1;
      $('next-btn').disabled = state.page >= state.pages;
    } catch (err) {
      $('filter-error').textContent = err.message;
    }
  }

  function hasFilters() {
    return ['f-q', 'f-type', 'f-category', 'f-from', 'f-to', 'f-min', 'f-max'].some(function (id) { return $(id).value !== ''; });
  }

  /* ---------- add / edit dialog ---------- */
  function refreshCategoryOptions(selected) {
    fillOptions($('tx-category'), categories[selectedType()]);
    if (selected) $('tx-category').value = selected;
  }

  function openDialog(tx) {
    editingId = tx ? tx._id : null;
    Artha.dom.clearFieldErrors('tx', FIELDS);
    $('tx-dialog-title').textContent = tx ? 'Edit transaction' : 'Add transaction';
    document.querySelector('#tx-form input[name="type"][value="' + (tx ? tx.type : 'expense') + '"]').checked = true;
    refreshCategoryOptions(tx && tx.category);
    $('tx-amount').value = tx ? tx.amount : '';
    $('tx-date').value = tx ? String(tx.date).slice(0, 10) : todayISO();
    $('tx-description').value = tx ? tx.description : '';
    $('tx-dialog').showModal();
    $('tx-amount').focus();
  }

  function validateForm() {
    var errors = {};
    var amount = $('tx-amount').value;
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) errors.amount = 'Enter an amount greater than zero (max 2 decimals)';
    if (!$('tx-date').value) errors.date = 'Date is required';
    if (!$('tx-category').value) errors.category = 'Choose a category';
    Object.keys(errors).forEach(function (f) { Artha.dom.setFieldError('tx', f, errors[f]); });
    return Object.keys(errors).length === 0;
  }

  async function save(e) {
    e.preventDefault();
    Artha.dom.clearFieldErrors('tx', FIELDS);
    if (!validateForm()) return;
    var body = {
      type: selectedType(),
      category: $('tx-category').value,
      amount: Number($('tx-amount').value),
      date: $('tx-date').value,
      description: $('tx-description').value.trim(),
    };
    var btn = $('tx-save');
    btn.disabled = true;
    try {
      if (editingId) await Artha.api.put('/transactions/' + editingId, body);
      else await Artha.api.post('/transactions', body);
      $('tx-dialog').close();
      Artha.dom.toast(editingId ? 'Transaction updated' : 'Transaction added');
      await load();
    } catch (err) {
      Artha.dom.showServerErrors('tx', FIELDS, err);
    } finally {
      btn.disabled = false;
    }
  }

  async function remove(tx) {
    if (!window.confirm('Delete this ' + tx.type + ' of ' + fmt(tx.amount) + ' (' + tx.category + ')?')) return;
    try {
      await Artha.api.del('/transactions/' + tx._id);
      Artha.dom.toast('Transaction deleted');
      await load();
    } catch (err) {
      Artha.dom.toast(err.message, true);
    }
  }

  /* ---------- wiring ---------- */
  async function init() {
    var cat = (await Artha.api.get('/transactions/categories')).data;
    categories = cat;
    var all = cat.expense.concat(cat.income.filter(function (c) { return cat.expense.indexOf(c) === -1; }));
    fillOptions($('f-category'), all, true);
    refreshCategoryOptions();

    $('add-btn').addEventListener('click', function () { openDialog(null); });
    $('tx-cancel').addEventListener('click', function () { $('tx-dialog').close(); });
    $('tx-form').addEventListener('submit', save);
    document.querySelectorAll('#tx-form input[name="type"]').forEach(function (r) {
      r.addEventListener('change', function () { refreshCategoryOptions(); });
    });
    $('filter-form').addEventListener('submit', function (e) { e.preventDefault(); state.page = 1; load(); });
    $('f-sort').addEventListener('change', function () { state.page = 1; load(); });
    $('reset-btn').addEventListener('click', function () { $('filter-form').reset(); state.page = 1; load(); });
    $('prev-btn').addEventListener('click', function () { if (state.page > 1) { state.page -= 1; load(); } });
    $('next-btn').addEventListener('click', function () { if (state.page < state.pages) { state.page += 1; load(); } });
    await load();
  }

  Artha.layout.start('transactions', init);
})();
