/* Landing page: login / register forms plus a small system-status footer. */
(function () {
  var auth = Artha.auth;
  var $ = function (id) { return document.getElementById(id); };

  $('theme-toggle').addEventListener('click', function () { Artha.theme.toggle(); });

  /* ---------- helpers ---------- */
  function setFieldError(formPrefix, field, message) {
    var input = $(formPrefix + '-' + field);
    var out = $(formPrefix + '-' + field + '-error');
    if (!input || !out) return;
    out.textContent = message || '';               // textContent: server text can never inject HTML
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function clearErrors(formPrefix, fields) {
    fields.forEach(function (f) { setFieldError(formPrefix, f, ''); });
    showBanner('');
  }

  function showBanner(message) {
    var el = $('form-error');
    el.textContent = message || '';
    el.hidden = !message;
  }

  function setBusy(form, busy, idleText, busyText) {
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = busy;
    btn.textContent = busy ? busyText : idleText;
  }

  /* Show the server's per-field messages if present, otherwise one banner message. */
  function showServerError(formPrefix, err) {
    var fields = err.payload && err.payload.fields;
    if (fields && Object.keys(fields).length) {
      var first = null;
      Object.keys(fields).forEach(function (f) {
        setFieldError(formPrefix, f, fields[f]);
        if (!first && $(formPrefix + '-' + f)) first = $(formPrefix + '-' + f);
      });
      if (first) first.focus();
    } else {
      showBanner(err.message);
    }
  }

  /* Run client-side checks; returns true when all pass. */
  function runChecks(formPrefix, checks) {
    var firstBad = null;
    Object.keys(checks).forEach(function (field) {
      var msg = checks[field]();
      setFieldError(formPrefix, field, msg);
      if (msg && !firstBad) firstBad = $(formPrefix + '-' + field);
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  /* ---------- tabs ---------- */
  function showTab(which) {
    var isLogin = which === 'login';
    $('tab-login').setAttribute('aria-selected', String(isLogin));
    $('tab-register').setAttribute('aria-selected', String(!isLogin));
    $('login-form').hidden = !isLogin;
    $('register-form').hidden = isLogin;
    showBanner('');
  }
  $('tab-login').addEventListener('click', function () { showTab('login'); });
  $('tab-register').addEventListener('click', function () { showTab('register'); });

  /* ---------- login ---------- */
  var loginForm = $('login-form');
  var LOGIN_FIELDS = ['email', 'password'];
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearErrors('login', LOGIN_FIELDS);
    var email = $('login-email').value;
    var password = $('login-password').value;
    if (!runChecks('login', {
      email: function () { return auth.validate.email(email); },
      password: function () { return auth.validate.loginPassword(password); },
    })) return;

    setBusy(loginForm, true, 'Log in', 'Logging in...');
    try {
      await auth.login(email, password);
      window.location.href = auth.DASHBOARD_URL;
    } catch (err) {
      showServerError('login', err);
      setBusy(loginForm, false, 'Log in', 'Logging in...');
    }
  });

  /* ---------- register ---------- */
  var registerForm = $('register-form');
  var REGISTER_FIELDS = ['name', 'email', 'password', 'confirm'];
  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearErrors('register', REGISTER_FIELDS);
    var name = $('register-name').value;
    var email = $('register-email').value;
    var password = $('register-password').value;
    var confirm = $('register-confirm').value;
    if (!runChecks('register', {
      name: function () { return auth.validate.name(name); },
      email: function () { return auth.validate.email(email); },
      password: function () { return auth.validate.password(password); },
      confirm: function () { return confirm === password ? '' : 'Passwords do not match'; },
    })) return;

    setBusy(registerForm, true, 'Create account', 'Creating account...');
    try {
      await auth.register(name, email, password);
      window.location.href = auth.DASHBOARD_URL;
    } catch (err) {
      showServerError('register', err);
      setBusy(registerForm, false, 'Create account', 'Creating account...');
    }
  });

  /* ---------- already logged in? skip the form ---------- */
  if (Artha.token.get()) {
    Artha.api.get('/auth/me').then(function () {
      window.location.href = auth.DASHBOARD_URL;
    }).catch(function () { /* invalid/expired token: api.js already cleared it; show the form */ });
  }

  /* ---------- system status footer ---------- */
  function setBadge(id, ok, okText, badText) {
    var el = $(id);
    el.textContent = ok ? okText : badText;
    el.className = 'badge ' + (ok ? 'badge--ok' : 'badge--bad');
  }

  async function checkStatus() {
    var data = null;
    var apiReachable = true;
    try {
      data = (await Artha.api.get('/health')).data;
    } catch (err) {
      if (err.payload && err.payload.data) data = err.payload.data; // 503: API up, database not
      else apiReachable = false;
    }
    setBadge('status-api', apiReachable, 'Online', 'Unreachable');
    setBadge('status-db', !!data && data.database.state === 'connected', 'Connected',
      apiReachable ? 'Disconnected' : 'Unknown');
  }
  checkStatus();
})();
