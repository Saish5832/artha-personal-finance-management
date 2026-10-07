/* Small shared helpers. */
(function () {
  window.Artha = window.Artha || {};

  /** Escape text before putting it into innerHTML (XSS defence). Prefer textContent when possible. */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Indian-rupee formatting with lakh/crore grouping, e.g. 123456 -> ₹1,23,456.00 */
  function formatINR(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return '₹0.00';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
  }

  function formatPercent(value, digits) {
    var n = Number(value);
    if (!isFinite(n)) return '-';
    return n.toFixed(digits == null ? 1 : digits) + '%';
  }

  function formatDate(value) {
    var d = new Date(value);
    if (isNaN(d)) return '-';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  window.Artha.utils = { escapeHtml: escapeHtml, formatINR: formatINR, formatPercent: formatPercent, formatDate: formatDate };
})();
