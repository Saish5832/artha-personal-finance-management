/* Tiny DOM helpers. Text always goes through textContent, so user-supplied strings can never inject HTML. */
(function () {
  window.Artha = window.Artha || {};

  /* el('button', { className: 'btn', text: 'Save', on: { click: fn }, attrs: { 'aria-label': 'x' } }, child1, child2) */
  function el(tag, props) {
    var node = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (key) {
      var value = props[key];
      if (value == null || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key === 'on') Object.keys(value).forEach(function (evt) { node.addEventListener(evt, value[evt]); });
      else if (key === 'attrs') Object.keys(value).forEach(function (a) { node.setAttribute(a, value[a]); });
      else node[key] = value;
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child == null || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  var toastTimer;
  function toast(message, isError) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = el('div', { className: 'toast' + (isError ? ' toast--error' : ''), text: message, attrs: { role: 'status' } });
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 3500);
  }

  /* Per-field error display for forms whose inputs are named "<prefix>-<field>" with a "<prefix>-<field>-error" paragraph. */
  function setFieldError(prefix, field, message) {
    var input = document.getElementById(prefix + '-' + field);
    var out = document.getElementById(prefix + '-' + field + '-error');
    if (out) out.textContent = message || '';
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  function clearFieldErrors(prefix, fields) {
    fields.forEach(function (f) { setFieldError(prefix, f, ''); });
    var banner = document.getElementById(prefix + '-error');
    if (banner) { banner.textContent = ''; banner.hidden = true; }
  }
  /* Shows the server's per-field messages; anything else goes to the form banner. */
  function showServerErrors(prefix, fields, err) {
    var map = err.payload && err.payload.fields;
    var shown = false;
    if (map) {
      Object.keys(map).forEach(function (f) {
        if (fields.indexOf(f) !== -1) { setFieldError(prefix, f, map[f]); shown = true; }
      });
    }
    if (!shown) {
      var banner = document.getElementById(prefix + '-error');
      if (banner) { banner.textContent = err.message; banner.hidden = false; }
    }
  }

  window.Artha.dom = { el: el, clear: clear, toast: toast, setFieldError: setFieldError, clearFieldErrors: clearFieldErrors, showServerErrors: showServerErrors };
})();
