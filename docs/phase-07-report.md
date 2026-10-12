# Phase 07 — Goal-Based Strategy Optimization

The existing Simulation Lab now includes a **Goal Optimizer**. Merchants specify a profit-increase target, decision limits and fixed behavioral assumptions. A bounded deterministic grid search evaluates the unchanged simulation engine and returns up to three feasible strategies, ranked by modeled operating profit. Any recommendation can be sent to the existing A/B Arena alongside the historical strategy. No historical business records or scenario history are written.

## Algorithm and financial integrity

`GoalOptimizationService.optimize` validates the bounded grid before querying history, calls `FinanceService.get_summary` once, and passes that same frozen baseline to every call of the existing Phase 05 `simulate` function. The existing request dependency uses a PostgreSQL **read-only, repeatable-read transaction**. The Phase 06 canonical baseline fingerprint identifies the shared financial input snapshot.

The searched decisions are selling-price change, additional discount, advertising increase and additional operating expense. Conversion, visitor change and unit-cost change are **fixed across all candidates**. Conversion is either the exact historical orders/visitors ratio or an explicit user assumption. There is no automatic relationship between prices/discounts/advertising and customer behavior.

Each axis contains its inclusive endpoints and evenly spaced Decimal values. Percentage axes round HALF_UP to four decimal places; currency axes to two. Equal rounded points are deduplicated before computing the Cartesian product. Each axis accepts 2–5 points; at most **625 unique candidates** are permitted. A smaller user `max_candidates` is enforced against the actual deduplicated grid. An oversized request returns 422 before loading the baseline. No SciPy, new dependency or probabilistic model is used.

The target is:

```text
target operating profit = CEILING_TO_CENT(
    baseline operating profit × (1 + requested percentage increase / 100)
)
```

Upward cent rounding prevents a fractional-cent target from being accepted below its requested value. A percentage-increase target requires complete data and **strictly positive baseline operating profit**. Zero, negative or unknown baseline profit returns `unavailable`, null target metrics, zero evaluated candidates and an explanation; a percentage is not invented for a loss.

Every candidate uses the existing VAT, discount, snapshot-COGS, refund/restock, fixed/variable expense, advertising and expected-order rounding definitions. No financial total is reimplemented. Candidates are rejected when the engine cannot produce a result, profit is below target, or the optional minimum **published operating margin** is not met. An undefined margin fails a requested margin floor. Rejection counts are exclusive, in that order, and reconcile with the evaluated and feasible counts.

Feasible candidates sort by operating profit descending. Equal-profit ties sort by price change, discount, advertising increase and additional expense ascending. The first three distinct parameter configurations are returned. UUID5 identifiers derive from model/search version, baseline fingerprint and numerically normalized parameters, making repeated runs deterministic. Different parameter configurations may have equal financial outcomes.

An empty feasible set yields `target_not_achievable`, unless every candidate is unsupported, in which case it yields `unavailable`. Failure is explicitly scoped to the **current assumptions, constraints and evaluated grid**. A discrete grid may miss solutions between sampled points.

## Constraints and API

`POST /api/optimization/goal` accepts the existing required inclusive period, limited to 366 days, plus:

| Field | Validation / unit |
| --- | --- |
| `target_profit_increase_pct` | Required, 0–10,000%, up to four decimal places |
| `constraints.min_selling_price_change_pct` | Required, −100 to 1,000% |
| `constraints.max_selling_price_change_pct` | Required, −100 to 1,000%, at least the minimum |
| `constraints.max_discount_pct` | Required, 0–100%; additional discount after price change |
| `constraints.max_advertising_increase_amount` | Required, nonnegative additional amount in store currency |
| `constraints.max_additional_operating_expense_amount` | Required, nonnegative additional amount in store currency |
| `constraints.minimum_operating_profit_margin_pct` | Optional null or 0–100% |
| `behavioral_assumptions.conversion_mode` | Required `historical` or `explicit` |
| `behavioral_assumptions.expected_conversion_rate` | Historical requires null; explicit requires 0–100% |
| `behavioral_assumptions.visitor_change_pct` | Fixed −100 to 10,000%, default zero |
| `behavioral_assumptions.unit_cost_change_pct` | Fixed −100 to 1,000%, default zero |
| `search.price_points`, `discount_points`, `advertising_points`, `expense_points` | Strict integers 2–5; defaults 5, 3, 2, 2 |
| `search.max_candidates` | Strict integer 1–625, default 625 |

Both constraint and behavioral-assumption objects are required. Advertising and extra-expense axes range from zero to their maxima; the MVP does not search spending cuts. Rates use the existing exact Decimal validators. Currency inputs allow two places and at most 14 whole digits. JSON floats/bools, nonfinite values, contradictory ranges and extra fields are rejected. No store or tenant selector is accepted; the configured demo IDs and both demo flags remain required.

Example request:

```json
{
  "start_date": "2026-09-01",
  "end_date": "2026-09-30",
  "target_profit_increase_pct": "10",
  "constraints": {
    "min_selling_price_change_pct": "0",
    "max_selling_price_change_pct": "10",
    "max_discount_pct": "10",
    "max_advertising_increase_amount": "0",
    "max_additional_operating_expense_amount": "0",
    "minimum_operating_profit_margin_pct": null
  },
  "behavioral_assumptions": {
    "conversion_mode": "historical",
    "expected_conversion_rate": null,
    "visitor_change_pct": "0",
    "unit_cost_change_pct": "0"
  },
  "search": {
    "price_points": 5,
    "discount_points": 3,
    "advertising_points": 2,
    "expense_points": 2,
    "max_candidates": 625
  }
}
```

The response includes `model_version: aggregate-v1`, `search_version: grid-v1`, `snapshot_id`, store/currency/period, `baseline`, the fully applied `request`, `target_operating_profit`, `target_profit_difference`, `candidates_evaluated`, `feasible_candidate_count`, `status`, `recommendations`, `rejections`, `assumptions`, `constraint_explanations` and `warnings`. Each recommendation includes its ID, name, all seven simulation parameters, existing simulated metrics/differences, assumptions/warnings and satisfied-constraint explanations. Money and percentages remain decimal strings.

Economic infeasibility is an explained HTTP 200 result. Structurally invalid requests use 422; existing missing-store/database/internal-error responses remain unchanged. [OpenAPI](openapi.json), [the API handoff](api.md) and [the actual example response](phase-07-optimization-example.json) document the complete contract.

## Reproducible example

Using the unchanged September seed, baseline operating profit is **10,182.18 USD**. A 10% increase requires **11,200.40 USD**, including upward cent rounding. The request above has 15 unique candidates after deduplicating the zero spending ranges: **4 feasible**, **11 below target**, and no other rejections.

| Recommendation | Price change | Discount | Expected profit, USD | Profit difference, USD |
| --- | ---: | ---: | ---: | ---: |
| Strategy 1 | +10% | 0% | 13,119.34 | +2,937.16 |
| Strategy 2 | +7.5% | 0% | 12,385.05 | +2,202.87 |
| Strategy 3 | +5% | 0% | 11,650.76 | +1,468.58 |

All retain 342 expected orders, the exact historical conversion ratio and unchanged advertising/operating spending. These figures illustrate a fixed-demand model, not evidence that customers would accept higher prices without reducing demand. With conversion and traffic held fixed, the model naturally favors higher prices and lower discounts/optional spending; this limitation is explicitly displayed.

## Frontend and Arena handoff

Simulation Lab retains its Single scenario and A/B Arena modes and adds **Goal Optimizer**. The compact React Hook Form/Zod form exposes the goal, all decision constraints, optional margin floor, historical/explicit conversion choice, and fixed visitor/unit-cost assumptions. The browser uses a disclosed 5×3×2×2 grid, at most 60 candidates before deduplication; the API supports up to 625.

Results show historical and target profit, candidate counts, rejection explanations, ranked strategy cards, financial impact, applied parameters, satisfied constraints and limitations. A nonanimated Recharts chart compares historical and strategy operating profits. Existing BigInt money formatting preserves exact cents in labels and tooltips. Feasibility and count consistency are validated before rendering; missing financial values are not charted as zero.

**Send to A/B Arena** opens two editable drafts: the unchanged historical strategy and the chosen recommendation. The recommendation's parameters and reporting dates are preserved. Arena then recalculates both against a fresh shared snapshot; unchanged history reproduces the optimization result. If historical data changes, the later comparison may change. Existing Arena operations continue to work.

Editing inputs or dates invalidates results and aborts pending requests. Stale responses are ignored. Loading, error/retry, unsupported baseline and unreachable target states are explicit. Drafts and results remain transient browser state; switching modes or leaving the page does not save a strategy.

## Executed verification

All checks ran locally with Node 24.19.0, Python 3.12.14 and PostgreSQL 16.2 on macOS Apple Silicon:

| Check | Result |
| --- | --- |
| Full backend suite | **465 passed**, no skips/failures, 18.32 seconds |
| New optimization database/API tests | **36 passed**, included above |
| Full frontend suite | **66 passed**, including 7 new optimizer tests |
| TypeScript and Vite production build | **Passed**, including final response guards |
| Chromium production-build suite against real FastAPI/PostgreSQL | **30 passed**, 17.4 seconds on the final build |
| Desktop and 375px mobile screenshots | Reviewed; strategy cards/chart render and no page-width overflow |

Backend tests cover independently calculated achievable targets and ranked profits, upward cent rounding, impossible goals, minimum-margin filtering, all 625 candidate boundaries, deduplicated caps, fixed assumptions, deterministic ties/IDs, preview parity, one baseline load, constant database query count, zero/negative/missing baselines, tenant scope, invalid inputs and rejection reconciliation. Business-row fingerprints are unchanged; the actual HTTP session is verified read-only and repeatable-read.

Frontend tests cover contract validation, contradictions, required explicit conversion, fixed assumptions, infeasible/unavailable/error states, exact transfer parameters and date-change cancellation of late responses. Three added browser workflows cover successful optimization and Arena reconciliation, impossible targets and invalidation, and explicit assumptions on mobile. All 27 prior browser tests remain passing.

Commands executed:

```sh
TEST_DATABASE_URL='<local isolated rdl_test_* URL>' .venv/bin/python -m pytest -c backend/pytest.ini backend/tests
npm test
npm run build
TEST_DATABASE_URL='<dedicated seeded local browser URL>' npm run test:e2e
```

Nonblocking existing warnings remain: Starlette/AnyIO deprecation, Vite's bundle-size warning (approximately 905 kB before compression), and Playwright color-environment warnings. No dependency or migration was added. Existing uncommitted work and persistent demo/admin/browser data were preserved; no reset, commit, push or deployment was performed. Verification-owned HTTP servers and local PostgreSQL were stopped after the checks; persisted local database files remain intact.

## Exact Phase 07 file inventory

The inventory is relative to the start of Phase 07, rather than the earlier Git baseline containing uncommitted previous-phase work.

Created:

- `backend/app/api/optimization.py`
- `backend/app/schemas/optimization.py`
- `backend/app/services/optimization.py`
- `backend/tests/test_optimization_database.py`
- `src/api/optimization.ts`
- `src/api/optimization.test.ts`
- `src/hooks/use-optimization.ts`
- `src/components/goal-optimizer.tsx`
- `src/components/goal-optimizer.test.tsx`
- `src/test/optimization-fixture.ts`
- `tests/e2e/optimization.spec.ts`
- `docs/phase-07-report.md`
- `docs/phase-07-optimization-example.json`

Modified:

- `backend/app/main.py`: optimization route registration and version 0.7.0.
- `src/api/client.ts`: validated optimization POST.
- `src/pages/simulation-lab.tsx`: Goal Optimizer mode and Arena transfer.
- `src/components/simulation-arena.tsx`: optional initial drafts from a recommendation.
- `src/index.css`: minimal optimizer form/card layout.
- `src/App.tsx`, `src/components/layout.tsx`: current phase labels.
- `README.md`, `docs/api.md`, `docs/openapi.json`, `.github/workflows/verify.yml`: usage, contracts, export and phase label.

Existing finance/simulation/comparison calculations, database models, migrations, seeds, manifests, lockfiles and previous tests/reports remain intact.

## Limits and completion

Recommendations are highest-profit **tested grid candidates under fixed assumptions**, not a guaranteed real-world optimum. No validated price-demand model, predicted advertising return, risk probability, Monte Carlo, ML or live experiment is provided. All Phase 05 aggregate accounting and completeness limitations continue to apply. Percentage goals for zero/negative baseline profit require a future separately defined absolute-profit or loss-reduction objective and are deliberately unavailable here. Scenarios and baseline snapshots are not durably stored. Live Supabase, Windows and hosted CI remain unverified.

No unresolved local Phase 07 functional blocker remains. Implementation and verification completed before the October 12, 2026 16:00 Europe/Istanbul deadline. Phase 08 has not been started.
