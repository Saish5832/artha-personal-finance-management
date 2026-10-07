/** Money helpers. Amounts are stored as plain numbers rounded to 2 decimals (paise). */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

module.exports = { round2, MAX_AMOUNT: 1e9 };
