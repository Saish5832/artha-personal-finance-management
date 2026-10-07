/* Light/dark theme. Loaded in <head> (before the body renders) to avoid a flash of the wrong theme. */
(function () {
  var KEY = 'artha-theme';

  function preferred() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) { /* storage unavailable: fall through */ }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function toggle() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
    return next;
  }

  apply(preferred());
  window.Artha = window.Artha || {};
  window.Artha.theme = { toggle: toggle };
})();
