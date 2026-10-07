# ARTHA - Personal Finance Management System

Track your money. Understand your spending. Reach your goals.

> **Status: Phase 7 (rule-based financial alerts and recommendations) complete**, building on
> authentication, transactions, budgets, goals, dashboard, analytics and historical regression. Artha uses
> deterministic rule-based financial alerts and recommendations rather than AI/ML-based recommendation
> generation. This page covers setup and running the implemented system.

Artha is a college engineering project: Node.js/Express backend, MongoDB, vanilla HTML/CSS/JS frontend,
and a Python (Pandas/NumPy) analysis module. There is **no AI/ML** and no LLM-based recommendation engine.
The app generates financial alerts and recommendations from predefined, deterministic rules that are easy to
explain and defend in the research paper.

## Prerequisites

- Node.js 18+ (developed on 22)
- Python 3.10+ with `pip`
- MongoDB (local Community Server, or a free MongoDB Atlas cluster)

## Setup

```bash
# 1. Node dependencies
npm install

# 2. Python dependencies
pip install -r python-analysis/requirements.txt

# 3. Configuration
cp .env.example .env
#   then edit .env: set MONGODB_URI and a JWT_SECRET (>= 32 chars). Generate one with:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

On Windows use `copy .env.example .env`, and set `PYTHON_BIN=python` in `.env`.

## Run

```bash
npm start          # http://localhost:5000
npm run dev        # same, with auto-restart (nodemon)
```

Open http://localhost:5000 to register or log in. The footer of the landing page shows live API and
database status; `GET /api/health` returns the same information as JSON.

## Authentication API (Phase 2)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | Create an account -> `201 { user, token }` |
| POST | `/api/auth/login` | public | Log in -> `200 { user, token }` |
| POST | `/api/auth/logout` | public | Stateless logout (client discards the token) |
| GET | `/api/auth/me` | **Bearer token** | The caller's own profile |

Send the token as `Authorization: Bearer <token>`. Tokens expire after 2 hours (`JWT_EXPIRES_IN`).
Passwords: 8-72 characters with at least one letter and one number; stored only as bcrypt hashes.

On startup the server prints whether the Python analysis engine is available:

```
[db] Connected to MongoDB
[server] Artha running at http://localhost:5000 (development)
[python] OK: Python 3.12.3, pandas 3.0.2, numpy 2.4.4
```

## Tests

```bash
npm test           # Jest + Supertest (backend)
npm run test:py    # pytest (Python analysis module); works on Windows, macOS and Linux
npm run test:all   # both
```

The backend tests use a **real MongoDB** (no database mocking). Two ways to provide one:

1. **A MongoDB you already run (recommended on your own machine).** Set `TEST_MONGODB_URI`.
   The easiest, on every OS, is one line in your `.env` file:
   ```
   TEST_MONGODB_URI=mongodb://127.0.0.1:27017
   ```
   or per command: PowerShell `$env:TEST_MONGODB_URI="mongodb://127.0.0.1:27017"; npm test`,
   cmd `set TEST_MONGODB_URI=mongodb://127.0.0.1:27017 && npm test`, macOS/Linux
   `TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test`.
2. **Nothing set (default, good for CI / a fresh checkout).** The tests start an in-memory MongoDB through
   `mongodb-memory-server`, which downloads a MongoDB binary the first time (needs internet).

Either way, every test file gets its own database named `artha_test_<pid>_<time>_<random>` that is dropped
afterwards. The helper refuses to drop any database whose name does not start with `artha_test_`, so your
real `artha` database is never touched.

## Project structure

```
backend/     Express app: config/, controllers/, middleware/, models/, routes/, services/, utils/
frontend/    pages/, components/, css/, js/, assets/
python-analysis/   analysis.py (JSON stdin/stdout entry point), preprocessing.py, eda.py, regression.py
tests/       backend tests          docs/   design decisions, paper reconciliation
```

## Documentation

- `docs/decisions.md`: design decisions explained for the viva
- `docs/paper-reconciliation.md`: how the implementation maps to the research paper


## Transactions, budgets and goals API

All routes require `Authorization: Bearer <token>` and only ever touch the caller's own data.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/transactions/categories` | Fixed income/expense category lists |
| GET | `/api/transactions` | List with filters: `type, category, q, from, to, minAmount, maxAmount, sortBy, order, page, limit`. Returns `items`, `pagination`, and `totals` (income/expense/net for ALL matches) |
| POST | `/api/transactions` | Create `{ type, category, amount, date, description? }` |
| GET / PUT / DELETE | `/api/transactions/:id` | Read / replace / delete one |
| GET | `/api/budgets[?asOf=&period=]` | Budgets with calculated `spent, remaining, utilization, status, overBudget, alert` |
| POST | `/api/budgets` | Create `{ category, amount, period? }` (409 if that category+period already exists) |
| GET / PUT / DELETE | `/api/budgets/:id` | Read / replace / delete one |
| GET | `/api/goals[?asOf=]` | Goals with calculated `remaining, progress, estimatedMonths, projectedCompletionDate, requiredMonthly, contributionGap, onTrack` |
| POST | `/api/goals` | Create `{ name, targetAmount, currentAmount?, monthlyContribution?, targetDate? }` |
| GET / PUT / DELETE | `/api/goals/:id` | Read / replace / delete one |
| POST | `/api/goals/:id/contributions` | Add money `{ amount }` to a goal |
| GET | `/api/dashboard[?asOf=YYYY-MM-DD]` | Authenticated financial summary, recent transactions, and six-month chart data |
| GET | `/api/analytics[?asOf=YYYY-MM-DD]` | Authenticated Pandas/NumPy exploratory analysis of transactions and calculated budgets |
| GET | `/api/regression[?asOf=YYYY-MM-DD]` | Authenticated historical income/savings and expenditure trend regression (statistical analysis, not AI) |
| GET | `/api/alerts[?asOf=YYYY-MM-DD]` | Rule-based financial alerts and recommendations generated from the authenticated user's own data |

Pages: `/pages/dashboard.html`, `/pages/transactions.html`, `/pages/budgets.html`, `/pages/goals.html`, `/pages/analytics.html`, `/pages/regression.html`, `/pages/alerts.html` (linked from the header on every signed-in page).

Rule-based financial alerts and recommendations are generated from deterministic conditions such as high budget utilization, excessive spending, savings shortfalls, category concentration, and low remaining budget. Each recommendation includes an explicit condition and reason. The application does not use AI, machine learning, LLMs, or probabilistic recommendation engines.

Financial Trends uses NumPy least squares for monthly income-to-savings and month-index-to-expenditure
relationships. Each fit requires at least three valid monthly observations; income-to-savings also requires
varying income. Results describe historical data only and are not guaranteed future outcomes or advice.
