# Paper reconciliation

Reference: *Artha – Personal Finance Management System: A Research Gap Analysis and Proposed Framework*
(S.P.I.T. Mumbai, August 2026). The paper is the primary functional specification; where the
project brief is more specific, the brief's choice is used and the difference is recorded here.

## Consistent with the paper (no action)

| Paper section | Where it is covered |
|---|---|
| V-A Transaction fields (ID, user, type, category, amount, date, optional description) | `transactions` schema: `_id`, `userId`, `type`, `category`, `amount`, `date`, optional `description` |
| VI Budget utilization = actual / budget x 100; Food 4700/5000 = 94% | Budget service (Phase 4) |
| VII Goal: 80,000 target, 30,000 saved, 5,000/month = 10 months | Goal service (Phase 5) |
| VIII Preprocessing, univariate / bivariate / multivariate EDA | `python-analysis/preprocessing.py`, `python-analysis/eda.py` (Phase 5) |
| IX Five visualizations | Dashboard charts (Phase 4) |
| X Regression: Income -> Savings, Month -> Expenditure; "not AI" | `regression.py` (Phase 6; NumPy least squares) |
| XI Rule-based alerts, rules 1-4, "not Explainable AI" | `ruleEngine.js` (Phase 10) |
| XII Architecture: Frontend -> Node/Express -> MongoDB + Python module (EDA, Regression) -> Dashboard | Phase 1 skeleton |
| XIV Workflow: visualization, regression and rules run in parallel after EDA/retrieval | Rule engine reads Node-side aggregates; it does not depend on Python output |
| XVII Limitations | README "Limitations" section (Phase 14) |

## Differences and decisions

1. **Visualization library.** The paper (abstract and Section XIII) names Matplotlib / Seaborn. The approved
   project brief specifies Chart.js for interactive charts. *Resolution:* Chart.js renders all charts in the
   browser; Python (Pandas/NumPy) computes the numbers behind them. **Needs your decision** (see report):
   either adjust the wording in the paper/report, or add optional Matplotlib image export later.
2. **Preprocessing owns monthly aggregation.** The paper lists "grouping transactions, aggregating monthly
   expenditure, calculating income and savings" under *preprocessing*. The earlier plan had this in `eda.py`.
   *Resolution:* `preprocessing.py` builds the shared monthly table; `eda.py` and `regression.py` consume it.
3. **Rule 3 wording (to settle in Phase 10).** The paper says: *Current savings < Required savings*, with the
   reason "Current savings are below the amount required to reach your selected goal". The earlier plan
   defined Rule 3 as a projected shortfall at the target date. Read literally, the paper's wording would fire
   for every unfinished goal. *Recommendation:* define "required savings" as the amount that should be saved by
   today to stay on a straight-line pace from the goal's creation date to its target date, so the paper's
   condition text is kept verbatim and it only fires when the user is behind. Rule 8 (contribution gap)
   remains separate. Goals without a target date are not evaluated by Rule 3.
4. **Negative "Remaining" is valid.** The paper's budget table shows Shopping at -Rs 300. The budget UI must
   display negative remaining amounts rather than clamping to zero.
5. **Regression wording.** The paper says regression gives "an estimate ... does not guarantee future
   outcomes". The UI will say "fitted values" and "trend estimate", never "prediction" or "forecast".
6. **"Reports" box on the paper's dashboard diagram.** The paper lists Charts / Reports / Alerts / Rules.
   The brief does not define reports. *Proposal:* optional CSV export of transactions in Phase 14 if time
   allows; not planned otherwise.

## Test fixtures taken from the paper

- Budget: Food 5000 budget, 4700 actual -> remaining 300, utilization 94%.
- Budget: Travel 3000 / 2500 -> remaining 500, 83.33%. Shopping 4000 / 4300 -> remaining -300, 107.5% (exceeded).
- Goal: Laptop, target 80000, current 30000, monthly 5000 -> remaining 50000, 10 months, 37.5% progress.
- Rule 1 example: 94% of Food budget -> "Reduce food expenditure."
