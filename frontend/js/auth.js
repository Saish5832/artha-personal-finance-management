/* Authentication helpers shared by all pages (window.Artha.auth).
   Token storage lives in api.js (Artha.token). The JWT is kept in localStorage (approved design);
   the XSS precautions are: a script-src 'self' CSP, no third-party scripts, and escaping/textContent
   for every piece of user-supplied text. */
(function () {
  var DASHBOARD_URL = '/pages/dashboard.html';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* Client-side validation mirrors the server rules for fast feedback.
     The server remains the authority and re-validates everything. Each returns an error string or ''. */
  var validate = {
    name: function (v) {
      v = (v || '').trim();
      return v.length >= 2 && v.length <= 60 ? '' : 'Name must be between 2 and 60 characters';
    },
    email: function (v) {
      v = (v || '').trim();
      if (!v) return 'Email is required';
      return EMAIL_RE.test(v) && v.length <= 254 ? '' : 'Please enter a valid email address';
    },
    password: function (v) {
      v = v || '';
      if (v.length < 8) return 'Password must be at least 8 characters';
      if (v.length > 72) return 'Password must be at most 72 characters';
      if (!/[A-Za-z]/.test(v)) return 'Password must contain at least one letter';
      if (!/\d/.test(v)) return 'Password must contain at least one number';
      return '';
    },
    loginPassword: function (v) { return v ? '' : 'Password is required'; },
  };

  async function register(name, email, password) {
    var res = await Artha.api.post('/auth/register', { name: name.trim(), email: email.trim(), password: password });
    Artha.token.set(res.data.token);
    return res.data.user;
  }

  async function login(email, password) {
    var res = await Artha.api.post('/auth/login', { email: email.trim(), password: password });
    Artha.token.set(res.data.token);
    return res.data.user;
  }

  /* Logout = discard the token (stateless JWT). The server call is best-effort. */
  async function logout() {
    try { await Artha.api.post('/auth/logout'); } catch (e) { /* ignore: we are leaving anyway */ }
    Artha.token.clear();
    window.location.href = '/';
  }

  /* Call at the top of every protected page. Resolves with the user, or redirects to login.
     (A 401 from the server also clears the token and redirects, see api.js.) */
  async function requireAuth() {
    if (!Artha.token.get()) {
      window.location.href = '/';
      return new Promise(function () {}); // never resolves: the page is navigating away
    }
    try {
      return (await Artha.api.get('/auth/me')).data.user;
    } catch (err) {
      if (err.status !== 401) throw err; // server down etc.: let the page show an error
      window.location.href = '/';
      return new Promise(function () {});
    }
  }

  window.Artha = window.Artha || {};
  window.Artha.auth = {
    DASHBOARD_URL: DASHBOARD_URL,
    validate: validate,
    register: register,
    login: login,
    logout: logout,
    requireAuth: requireAuth,
  };
})();
