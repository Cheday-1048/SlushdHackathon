# Phase 05 — Sales Simulation Engine

Phase 05 adds a functional Simulation Lab using actual PostgreSQL records from the configured synthetic demo store. Seven user assumptions produce deterministic revenue, expense, gross-profit and operating-profit comparisons. The baseline is the existing financial report; the results are explicitly hypothetical. No historical records or scenario history are written.

## Architecture and baseline

`POST /api/simulations/preview` validates `SimulationRequest`, then calls `SimulationService.preview`. The service loads the requested period through the unchanged `FinanceService.get_summary`, which uses scoped historical transaction, refund, traffic, expense and advertising records. The dedicated pure `services/simulation/` engine receives that `FinancialResult` and validated `ScenarioParameters`; it has no database dependency.

The request uses the existing PostgreSQL **read-only, repeatable-read transaction**. Every baseline field is therefore derived from one database snapshot. Fixed demo organization/store IDs and both `is_demo` flags remain mandatory. No store selectors are accepted in the body or query. Dates are required, inclusive in the store timezone, ordered, and limited to 366 calendar days. Unsafe minimum/maximum year boundaries are rejected. No schema migration, seed modification, dependency addition or new infrastructure was needed.

Money, expense totals, gross/contribution/operating profits and margins now share `services/finance/profit.py`. This is a small extraction of the existing definitions; the finance engine and simulation call the same functions. The prior VAT, refund, discount, snapshot-cost, missing-data and accounting rules remain in the finance engine. The baseline returned by preview is identical to `GET /api/finance/summary` for the same period and database state.

## Inputs

Percentage inputs use percentage points: `10` means 10%. Advertising and additional expenses use the selected store currency for the whole selected period. Pydantic accepts decimal strings, integers and Python Decimal values; JSON floating-point numbers, booleans, nonfinite values, extra fields and out-of-range values are rejected. The browser sends decimal strings. Rates allow four decimal places. Amounts allow two decimal places and at most 16 significant digits, including at most 14 whole digits.

| Parameter | Default | Allowed values / meaning |
| --- | --- | --- |
| `selling_price_change_pct` | `"0"` | −100 to 1,000; proportional change to historical net merchandise prices |
| `discount_pct` | `"0"` | 0 to 100; additional scenario discount, applied after price change |
| `expected_conversion_rate` | `null` | 0 to 100, or null to retain the exact historical orders/visitors ratio |
| `visitor_change_pct` | `"0"` | −100 to 10,000; proportional change to historical visitors |
| `unit_cost_change_pct` | `"0"` | −100 to 1,000; proportional change to net historical COGS per expected order |
| `advertising_budget_change_amount` | `"0.00"` | Signed currency change; the resulting advertising budget must remain nonnegative |
| `additional_operating_expense_amount` | `"0.00"` | Nonnegative currency amount added to fixed other operating expenses |

Omitting `parameters` applies defaults. Omitting one of its fields applies that field's default. Explicit dates are always required. Validation errors return 422. A resulting negative advertising budget returns `code: "invalid_simulation"` with a readable explanation. Request validation responses retain `loc`, `msg` and `type` but omit raw input/context, so raw JSON NaN/Infinity and numeric overflow also return JSON-safe 422 responses instead of a serialization error.

## Deterministic model and accounting

The model is labeled **aggregate-v1**. It preserves the historical net product mix, per-order basket and refund/restock pattern. It does not infer demand, elasticity, acquisition efficiency, supplier changes or real customer behavior.

Let historical orders be `N`, visitors `V`, and scenario visitor change `t`, price change `p`, additional discount `d`, unit-cost change `c`. The calculation uses a local Decimal precision of 50. `Q6` rounds expected quantities to six decimal places, and `Q2` rounds currency components to two decimal places, both HALF_UP.

```text
Expected visitors V' = Q6(V × (1 + t / 100))
Expected orders N'  = Q6(V' × assumed conversion / 100), if explicitly supplied
                     Q6(N × (V' / V)), otherwise
Volume factor       = N' / N
Price factor        = (1 + p / 100) × (1 − d / 100)

Merchandise revenue = Q2((baseline revenue − customer shipping revenue)
                         × volume factor × price factor)
Customer shipping   = Q2(baseline customer shipping revenue × volume factor)
Revenue             = merchandise revenue + customer shipping
COGS                = Q2(baseline net COGS × volume factor × (1 + c / 100))
Carrier shipping    = Q2(baseline carrier shipping × volume factor)
Platform fees       = Q2(baseline platform fees × volume factor)
Advertising         = Q2(baseline AdSpend + advertising currency change)
Other expenses      = Q2(baseline other expenses + additional operating expense)

Operating expenses  = employee + rent + carrier shipping + platform fees + other
Total expenses      = operating expenses + advertising
Gross profit        = revenue − COGS
Contribution profit = gross profit − carrier shipping − platform fees − advertising
Operating profit    = gross profit − total expenses
Profit margin       = Q2(profit / revenue × 100), only when revenue > 0
```

The same **published six-place expected order volume** scales revenue and every variable cost. Expected orders are never rounded to realized integer orders. Leaving conversion blank preserves unchanged-scenario identity, including for the seeded 342 orders / 11,635 visitors; using the displayed rounded 2.94% would introduce drift. The returned historical-ratio percentage is rounded to six places for display, while inherited volume uses the exact count ratio.

VAT is already removed according to historical line/shipping snapshots by the finance engine; simulation does not remove VAT again or project VAT liabilities. Historical discounts and dated refunds are already included in the net merchandise baseline. The additional discount is applied once, after price change. Customer shipping revenue receives neither price change nor additional discount.

COGS uses historical cost snapshots net of explicit restock reversals. Carrier shipping and platform fees vary with volume. Employee, rent, software and miscellaneous expenses remain fixed for the selected period. Advertising uses authoritative `AdSpend` once and does not automatically change visitors or conversion; advertising mirrors in `Expense` remain excluded. The engine returns the full projected cost breakdown even though the minimal interface emphasizes totals.

Differences are projected minus historical values. Revenue percentage change is defined only for a positive baseline revenue; operating-profit percentage change only for a positive baseline operating profit. Zero or negative denominators produce `null` and explanatory warnings. Negative projected profits and margins are retained. Margins require positive projected revenue.

## Missing inputs and limitations

- Incomplete financial/traffic inputs, zero baseline orders, zero baseline visitors, negative net merchandise revenue, or negative net COGS return `status: "unavailable"`, null projections/differences and warnings. They are not filled with guessed zeroes.
- A historical orders/visitors ratio above 100% requires an explicit valid conversion assumption; the inherited ratio is not silently capped.
- A valid positive historical basket can be projected to zero expected orders. Variable amounts become zero; fixed costs and the selected advertising budget remain payable.
- Large price, discount, cost, conversion or volume assumptions generate plausibility warnings. Results are not adjusted to manufacture a favorable outcome.
- Dated refunds may relate to earlier sales. Their net revenue/restock pattern is proportionally carried into the aggregate basket and explicitly warned about. There is no product-level demand or refund prediction.
- The finance engine's limits remain: two-decimal currency precision, booked expense basis, no input-VAT/income-tax model, no customer-shipping refund ledger, and operating profit rather than accounting net profit. Fixed monthly costs are not accrued across days.
- Reproducibility requires the same historical records, parameters, dates and model version. The response includes the complete baseline and applied parameters; snapshots and scenario history are not persisted. A later request can change if historical records change.
- This remains an unauthenticated synthetic demo. Live Supabase, Windows execution and hosted CI have not been verified during this phase.

## API and interface

Example request:

```json
{
  "start_date": "2026-09-01",
  "end_date": "2026-09-30",
  "parameters": {
    "discount_pct": "10",
    "expected_conversion_rate": "4",
    "visitor_change_pct": "10"
  }
}
```

The response contains `model_version`, `store_id`, `currency`, `reporting_period`, `baseline`, applied `parameters`, `status`, `simulated`, `differences`, `assumptions` and `warnings`. Money and percentages are decimal strings; historical counts are integers; expected counts are six-place decimal strings. `status: "unavailable"` is an explained HTTP 200 result. Invalid requests use 422, missing demo scope 404, database failures 503 and unexpected failures 500. CORS allows GET/POST only for configured origins.

The exact local response is saved in [phase-05-preview-example.json](phase-05-preview-example.json), and [openapi.json](openapi.json) includes the new schemas and route. With the unchanged September seed, this request yields **511.940000 expected orders**, **39,569.77 USD revenue**, **14,436.59 USD operating profit**, and **4,254.41 USD profit improvement**. These are scenario arithmetic, not a sales forecast.

The existing sidebar now opens `/simulation-lab`. The page uses React Hook Form, Zod, the existing Button/KPI components and Recharts. It shows the loaded historical period, source and four baseline metrics; all seven controls; historical versus hypothetical metrics and margins; currency differences; applied inputs; warnings and model assumptions. A single nonanimated bar chart compares revenue and operating profit, including losses. Dates can be changed explicitly before loading another baseline.

Loading, baseline retry, request errors, invalid inputs, empty baselines and incomplete results have explicit states. Editing an assumption or date aborts and clears the previous preview. Superseded responses are ignored. The baseline returned by a completed preview becomes authoritative if history changed since initial loading. The existing dashboard design and functionality are preserved.

Simulation money labels and chart tooltips format the original decimal strings using BigInt and `Intl.formatToParts`, preserving cents even at the maximum input magnitude. Number conversion is used only for chart coordinates and ordinary count/percentage display, never to recompute financial results.

## Manually reproducible example

The pure-engine test `test_discount_conversion_example_preserves_tax_discount_and_expense_definitions` uses 10,000 visitors and 200 historical orders:

1. Merchandise: 200 units × 600 VAT-inclusive price, minus 12,000 historical discount, divided by 1.20 = **90,000** VAT-exclusive merchandise revenue.
2. Customer shipping: 2,400 inclusive of 20% VAT = **2,000** revenue. Total baseline revenue = **92,000**.
3. Historical COGS: 200 × 200 = **40,000**. Gross profit = **52,000**.
4. Employee 10,000 + rent 5,000 + carrier shipping 2,000 + platform fees 1,000 + software 1,000 = **19,000** operating expenses. Authoritative ads = **4,000**. Baseline operating profit = **29,000**. An advertising expense mirror is deliberately ignored.
5. Scenario: additional discount **10%**, assumed conversion **2.5%**, all other changes zero. Expected orders = 10,000 × 2.5% = **250**; volume factor = **1.25**.
6. Merchandise = 90,000 × 1.25 × 0.90 = **101,250**; customer shipping = 2,000 × 1.25 = **2,500**; revenue = **103,750**.
7. COGS = **50,000**; carrier shipping = **2,500**; platform fees = **1,250**; fixed employee/rent/software = **16,000**; operating expenses = **19,750**; ads remain **4,000**.
8. Gross profit = **53,750**, gross margin **51.81%**; operating profit = **30,000**, operating margin **28.92%**. Revenue improvement = **11,750 / 12.77%**; operating-profit improvement = **1,000 / 3.45%**.

Run that reproducible case without a database:

```sh
.venv/bin/python -m pytest -c backend/pytest.ini backend/tests/test_simulation_calculations.py -k discount_conversion_example
```

## Executed verification

Initial baseline: **279 backend tests and 34 frontend tests passed** before Phase 05 verification. Final check results:

| Check | Result |
| --- | --- |
| Full backend suite, including real disposable PostgreSQL databases | **408 passed**, no skips/failures, 16.83 seconds |
| New pure simulation arithmetic/validation tests | **61 passed**, included in full suite |
| New simulation database/API tests | **68 passed**, included in full suite |
| Frontend unit/component/lifecycle tests | **49 passed**, including the final exact-cents formatting regression |
| TypeScript and Vite production build | **Passed**, including the final formatting and tooltip change |
| Chromium production-build tests against real FastAPI/PostgreSQL | **23 passed**, 15.9 seconds on the final build after the exact-cents formatting change |
| Desktop and 375px mobile screenshots | Visually reviewed; loss chart renders, comparison table scrolls in its panel, no page-width overflow |

Backend coverage includes independent mixed-VAT/discount/refund amounts, each control, combined scenarios, zero/loss/unsupported baselines, six-place volume consistency, catalog snapshot preservation, exact seeded identity, deterministic identical responses, API contracts, bounded dates, invalid/nonfinite inputs, CORS and tenant scoping. Full business-table fingerprints stay unchanged. An HTTP test uses the actual request-session dependency and verifies PostgreSQL `transaction_read_only = on`.

Frontend tests exercise string serialization, input bounds, null preservation, baseline load/retry, stale success/error cancellation, input changes, period binding and warnings. Five added browser workflows exercise unchanged identity, all seven controls with fractional orders and a loss, an actual empty period, negative-advertising rejection/recovery, and mobile results. All 18 existing dashboard browser workflows still pass.

Commands executed from the repository root using Node 24.19.0, Python 3.12.14 and local PostgreSQL 16.2 on macOS Apple Silicon:

```sh
TEST_DATABASE_URL='<local isolated rdl_test_* URL>' .venv/bin/python -m pytest -c backend/pytest.ini backend/tests
npm test
npm run build
TEST_DATABASE_URL='<dedicated seeded local browser URL>' npm run test:e2e
```

Existing warnings remain: Starlette/AnyIO deprecation, Vite bundle-size notice (approximately 864 kB before compression), and Playwright's inherited color-environment warning. These do not fail compilation or tests. Existing demo/admin/browser data was preserved; tests create/drop only their own disposable UUID databases. No reset, commit, push or deployment was performed. Verification-owned HTTP servers stopped when Playwright exited. Local PostgreSQL was stopped after verification; its persisted data remains under ignored `.local/postgres-data`.

## Exact file inventory

Created:

- `backend/app/api/simulations.py`
- `backend/app/schemas/simulation.py`
- `backend/app/services/simulation_reporting.py`
- `backend/app/services/simulation/__init__.py`
- `backend/app/services/simulation/types.py`
- `backend/app/services/simulation/calculations.py`
- `backend/app/services/finance/profit.py`
- `backend/tests/test_simulation_calculations.py`
- `backend/tests/test_simulation_database.py`
- `src/api/simulation.ts`
- `src/api/simulation.test.ts`
- `src/hooks/use-simulation.ts`
- `src/hooks/use-simulation.test.tsx`
- `src/pages/simulation-lab.tsx`
- `src/pages/simulation-lab.test.tsx`
- `src/test/simulation-fixture.ts`
- `src/lib/format-money.ts`
- `src/lib/format-money.test.ts`
- `tests/e2e/simulation.spec.ts`
- `docs/phase-05-report.md`
- `docs/phase-05-preview-example.json`

Modified:

- `backend/app/main.py`: route registration, version 0.5.0, POST CORS and safe validation errors.
- `backend/app/services/finance/calculations.py`: use extracted shared monetary/profit definitions.
- `src/api/client.ts`: validated POST preview, dated baseline request and readable validation failures.
- `src/App.tsx`, `src/components/layout.tsx`, `index.html`: Simulation Lab route/navigation and phase labels.
- `src/index.css`: minimal scenario controls, result layout and responsive styles.
- `tests/e2e/dashboard.spec.ts`: expect functional Simulation Lab navigation while future modules stay disabled.
- `README.md`, `docs/api.md`, `docs/openapi.json`, `.github/workflows/verify.yml`: current usage/contracts, exported schema and phase label.

Database models, migrations, seeds, manifests, lockfiles, prior reports and prior unit tests were preserved. Phase 06 and later roadmap features have not been started.

No unresolved local Phase 05 functional blocker remains. The work is complete within the October 12, 2026 16:00 Europe/Istanbul submission deadline; hosted services and CI still require their separately documented environment verification.
