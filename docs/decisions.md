# Design decisions (viva notes)

Each entry: what was decided, and why it is easy to defend.

## D1. Three layers inside Node: routes -> controllers -> services -> models
Routes map URLs to controllers; controllers handle HTTP only; services hold business logic and
calculations; models handle MongoDB. The rule engine and calculators are pure functions with no database
access, so they can be unit tested directly.

## D2. `app.js` is separate from `server.js`
`app.js` builds the Express app. `server.js` validates config, connects MongoDB and opens the port.
Tests import `app.js` without side effects (no port, no database).

## D3. One process serves API and frontend
Express serves `frontend/` as static files. One `npm start` runs everything; the browser and API share an
origin, so CORS is only needed for development from another port (allowlist in `config/cors.js`).

## D4. Python is a module, not a service
`pythonBridge.js` runs `python-analysis/analysis.py` with `child_process.execFile`:
JSON in on stdin, JSON out on stdout. `execFile` uses no shell, and data travels only over stdin, so request
data cannot become a command. The bridge has a timeout and an output-size cap. Any failure becomes a clean
`AppError` (500, or 422 for "InsufficientData") and cannot crash Node.
Python never touches MongoDB; Node queries the data and passes plain arrays.

## D5. stdout purity in Python
`analysis.py` writes exactly one JSON document to stdout. Handler `print()` output is diverted to stderr,
every exception is converted to a JSON error, and `NaN`/`Infinity` (invalid JSON) are rejected rather than emitted.

## D6. Consistent error shape
Every error is `{ "success": false, "error": "<label>", "message": "<text>" }` (plus optional `fields`).
`middleware/errorHandler.js` maps validation errors, bad ObjectIds, duplicate keys, malformed JSON,
oversized bodies, database outages and unexpected errors. Internal details are logged, never sent.

## D7. Fail fast on bad configuration
`validateEnv` reports every problem at once (missing `MONGODB_URI`, short or placeholder `JWT_SECRET`,
invalid `PORT`). If MongoDB is unreachable the server exits in about 5 seconds with a clear message instead of
starting in a broken state. A missing Python is only a warning: the rest of the app still works.

## D8. Health endpoint uses a live ping
`GET /api/health` returns 200 when healthy and 503 when the database is not usable. It actively pings
MongoDB (2 s cap) because the driver's connection state alone can stay "connected" for ~10 s after the
database dies. (Found and fixed during Phase 1 testing.)

## D9. Collection ownership
`users` is identified by its own `_id` and has no `userId` field.
`transactions`, `budgets`, `goals` and `alerts` each carry a `userId` reference to the authenticated user.
`userId` is always taken from the verified JWT, never from the request body or query string.

## D10. JWT in localStorage, stateless logout (approved)
Tokens expire after 2 hours (`JWT_EXPIRES_IN`). Logout means the client discards the token.
XSS mitigations: a Content-Security-Policy that only allows scripts from our own origin (`helmet`),
no third-party scripts, and all user-supplied text escaped before rendering (`Artha.utils.escapeHtml`).

## D11. Regression is statistics, not machine learning
NumPy least squares implements monthly income to savings and chronological month index to expenditure.
Both analyses require at least three monthly observations; income/savings also requires varying income.
Income/savings is stable when the slope implies no more than 1% of mean monthly savings per mean monthly
income (with a one-currency-unit floor). Expenditure slopes within 1% of mean monthly spending are stable;
otherwise R² below 0.5 is weak and a higher R² uses the slope direction. Current-versus-trend is near trend
within 5% (or one currency unit) of the fitted value. These deterministic descriptions cover historical
data only, not guaranteed future outcomes or recommendations. The application does not use scikit-learn.

## D12. Vendored front-end libraries, system fonts
No CDN dependencies at runtime, so the demo works offline. Fonts use the system stack.

## D13. Authentication flow (Phase 2)
1. `POST /api/auth/register` or `/login` (validated by express-validator) -> `authService` -> bcrypt -> JWT.
2. The client stores the JWT and sends `Authorization: Bearer <jwt>` on every later request.
3. `middleware/auth.js` verifies signature and expiry, loads the user from MongoDB, and sets `req.user`.
4. Controllers scope every query by `req.user._id`. A `userId` sent by the client is never used.
Logout is client-side (discard the token); tokens are short-lived (2 h) to limit the stateless-logout window.

## D14. Password handling
bcrypt (via `bcryptjs`, pure JavaScript so it installs everywhere), cost 12 (configurable, minimum 10 in
production). Only the hash is stored; it is excluded from every query (`select: false`) and from all JSON
output (`toJSON` transform), and tests assert that no response ever contains a hash or the plaintext.
Passwords are limited to 72 bytes because bcrypt ignores everything beyond that.

## D15. No account enumeration
Wrong password and unknown email return the identical `401 Invalid email or password`. When the email is
unknown the server still performs a bcrypt comparison, so response time does not reveal whether an account
exists. (Registration necessarily reveals that an email is taken; that is accepted for usability.)

## D16. Token hardening
JWT algorithm is pinned to HS256 (blocks `alg: none` and algorithm-confusion tokens). The token holds only
`sub` (user id), `iat` and `exp`; no personal data. If the account is deleted, its old tokens stop working
because the middleware loads the user on every request.

## D17. Injection and mass-assignment defence
Every auth field must be a string, so `{ "email": { "$ne": null } }` is rejected with 400 instead of being
executed as a MongoDB operator. Controllers copy only whitelisted fields from the body, so `_id`,
`passwordHash` or `role` in a request are ignored. A unique index on `email` is the database-level guard
against duplicate accounts, including two simultaneous registrations.

## D18. Dashboard (Phase 4)
`GET /api/dashboard` returns one authenticated, user-scoped dashboard payload. A MongoDB `$facet` computes
transaction totals, six-month series, category totals and recent activity in one transaction aggregation;
existing budget and goal services supply their established calculated values. The dashboard presents those
metrics and deterministic financial-health labels without generating advice. Chart.js is installed locally
and served by Express, so charts work without a CDN.

## D19. Test database setup and the Jest / MongoDB-driver handshake
Backend tests run against a real MongoDB (`tests/helpers/testDb.js`): `TEST_MONGODB_URI` if set, otherwise
`mongodb-memory-server`. Each test file gets an isolated `artha_test_*` database that is dropped afterwards
(never a database without that prefix), all models are loaded so every index is built, and a failed setup
releases its resources so Jest cannot hang.
**Why `runtimeAdapters: { os }` is passed in tests:** the MongoDB Node driver loads the `os` module with a
dynamic `import()`, which Jest's CommonJS sandbox does not support. The driver then silently sends an empty
client-metadata document in its handshake. Lenient servers accept it; strict ones (MongoDB 9.x and the
binaries `mongodb-memory-server` downloads) reject it with "Missing required sub-document 'driver'".
Supplying `os` directly avoids the dynamic import. Only the test helper needs this; the real app runs in plain
Node and is unaffected. `tests/testDbSetup.test.js` captures the real handshake and asserts it is complete.


## D20. Transactions, budgets and goals (batch 3)
Same layering as auth: routes -> validation -> controller -> service -> model. Rules worth defending:
- **Ownership:** every service query is `{ _id, userId: req.user._id }`. Someone else's record is reported as 404 (not 403), so
  ids cannot be probed. `userId` in a request body is ignored (whitelisted fields only; tests prove it).
- **Strict input types:** every body/query field must be a plain string/number, so `{ "$ne": null }` is rejected (400). Query
  strings like `?type[$ne]=x` are never read (only whitelisted names are). Search text is regex-escaped.
- **Closed category lists** (`utils/categories.js`) keep budgets, analytics and the rule engine deterministic.
- **Nothing derived is stored.** Budget spending/utilization and goal remaining/estimate are computed on every read by pure
  functions (`budgetCalculator.js`, `goalCalculator.js`), so they can never be stale and are unit-testable without a database.
- **Budget utilization** = spent / amount x 100, spent = this user's EXPENSE transactions in the category inside the current
  period window (weekly Monday-based, monthly, yearly; UTC). Status: ok, warning (>80), critical (>90), over (>=100).
  The thresholds are exported so the rule engine uses the same numbers.
- **Goal formulas:** remaining = target - current; estimated months = ceil(remaining / monthly). With a target date we also
  return the monthly amount needed and the contribution gap (reused by the "goal contribution gap" rule later).
- **Uniqueness:** one budget per user + category + period (unique index, plus a friendly pre-check on update).
- `?asOf=YYYY-MM-DD` lets budgets/goals be viewed "as of" another date (used by the UI period picker and by tests).

## D21. Exploratory analytics (Phase 5)
`GET /api/analytics` loads only the authenticated user's transactions and budget-service calculations, then
passes those records to `analysis.py` through the existing `execFile` JSON bridge. `preprocessing.py` drops
invalid rows, normalizes dates and prepares monthly aggregates; `eda.py` calculates descriptive statistics,
monthly relationships, category analysis and budget-versus-actual values using Pandas and NumPy. Missing
observations produce null correlations or empty series rather than invented values. Regression and alerts
are not part of this phase.

## D22. Historical financial trends (Phase 6)
`GET /api/regression` reads only the authenticated user's transactions and passes them through the shared
preprocessing module and existing `execFile` JSON bridge. The NumPy regression operation analyzes monthly
income/savings association and chronological expenditure trend. It requires three observations, reports
insufficient data instead of fabricating coefficients, and compares the current month's observed spending
to its fitted historical trend only when available. The Financial Trends page shows plain-language
interpretations and charts first, with equations and coefficients under a details disclosure. Results are
statistical descriptions, not guarantees about future spending.

## D23. Rule-based financial alerts and recommendations (Phase 7)
Artha uses a deterministic rule engine rather than AI or machine learning for recommendations. Each alert has a
hardcoded rule ID, rule name, threshold, actual value, recommendation and reason. The rule engine is pure
JavaScript and evaluates only the authenticated user's budgets, goals and transaction totals; it never accepts a
`userId` from the frontend or stores user-controlled recommendation logic in the database.

Rules are intentionally plain-English: `IF condition -> THEN recommendation -> REASON`. For example,
`Budget utilization >= 90%` triggers `Review your Food expenditure.` because `You have used 94% of your Food budget.`.
This makes the insight explainable and easy to defend in the research paper without claiming any AI behaviour.

The engine implements nine deterministic rules: high budget utilization, expenses exceeding income, savings goal
shortfall, category concentration, low savings rate, monthly spending spike, repeated category overspending,
goal contribution gap and low remaining budget. Alerts are sorted by severity (`CRITICAL`, `WARNING`, `INFO`) and
exposed via `GET /api/alerts` to the signed-in user only. The dashboard and the dedicated `/pages/alerts.html`
page surface the highest-priority active insights without redesigning the experience.
