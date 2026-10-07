/* API client: one place that talks to the REST backend.
   - adds the JWT (Authorization: Bearer ...) to every request
   - turns error responses into ApiError objects with the server's message
   - on a 401 for a logged-in user, clears the token and returns to the login page */
(function () {
  var BASE = '/api';
  var TOKEN_KEY = 'artha-token';

  var token = {
    get: function () { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } },
    set: function (t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* ignore */ } },
    clear: function () { try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } },
  };

  function ApiError(status, message, payload) {
    var err = new Error(message);
    err.name = 'ApiError';
    err.status = status;   // HTTP status (0 = network failure)
    err.payload = payload; // parsed JSON body, if any
    return err;
  }

  async function request(method, path, body) {
    var headers = { Accept: 'application/json' };
    var t = token.get();
    if (t) headers.Authorization = 'Bearer ' + t;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    var res;
    try {
      res = await fetch(BASE + path, {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (networkErr) {
      throw ApiError(0, 'Cannot reach the server. Check your connection and try again.', null);
    }

    var payload = null;
    try { payload = await res.json(); } catch (e) { /* non-JSON body */ }

    if (!res.ok) {
      if (res.status === 401 && t) {
        token.clear();
        // Expired/invalid session: go to the login page. Already there? Don't reload (it would wipe the form).
        if (window.location.pathname !== '/') window.location.href = '/';
      }
      throw ApiError(res.status, (payload && payload.message) || 'Request failed (' + res.status + ')', payload);
    }
    return payload;
  }

  window.Artha = window.Artha || {};
  window.Artha.token = token;
  window.Artha.api = {
    get: function (p) { return request('GET', p); },
    post: function (p, b) { return request('POST', p, b === undefined ? {} : b); },
    put: function (p, b) { return request('PUT', p, b); },
    patch: function (p, b) { return request('PATCH', p, b === undefined ? {} : b); },
    del: function (p) { return request('DELETE', p); },
  };
})();
