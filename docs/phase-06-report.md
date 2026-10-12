# Phase 06 — Simulation A/B Arena

The existing Simulation Lab now compares **2–4 named hypothetical strategies** against one real PostgreSQL financial baseline. Users can add, duplicate, rename, edit, remove, compare and reset scenarios, then manually select or exclude them from consideration. Existing dashboard and single-scenario preview behavior are preserved. No historical records, scenario history or user decisions are persisted.

## Calculation and snapshot consistency

`SimulationComparisonService.compare` calls `FinanceService.get_summary` **once**, outside the scenario loop. All scenarios receive the same frozen financial result, captured in the existing request-scoped PostgreSQL read-only, repeatable-read transaction. The service calls the unchanged Phase 05 `simulate` function for each scenario. Financial totals, VAT, discounts, historical cost snapshots, dated refunds/restocks, fixed/variable expenses, advertising and six-place expected-order rounding therefore retain their established definitions.

The response contains one shared baseline and a `snapshot_id` calculated as SHA-256 over its canonical full JSON representation: sorted keys, compact separators and UTF-8 encoding. This fingerprint identifies the aggregate financial calculation inputs returned in the response. It is deterministic for the same baseline, independent of scenario order, and changes when the returned baseline changes. It is **not** a persisted database snapshot, a full transaction-ledger audit hash, or a retrieval token. Reproduction uses the returned baseline, scenario parameters and unchanged `aggregate-v1` model.

New arithmetic only adds comparisons to existing engine outputs:

- Absolute difference = projected amount minus baseline amount.
- Percentage difference = absolute difference / baseline × 100, rounded to two places HALF_UP, only for positive baseline values. Zero, negative or unavailable denominators return `null` with warnings.
- Conversion difference is measured in **percentage points**, against the six-place historical orders/visitors ratio used by the simulation, rather than the financial report's two-place display. Unchanged scenarios therefore have exactly zero difference.
- Operating-margin difference is the difference between the published two-place margins, in percentage points, or null if a margin is undefined.

All comparison arithmetic uses Decimal with local precision 50. Expected orders remain fractional expectations, not realized sales. No ranking, winner, causal prediction, generated strategy or optimization is introduced. Identical parameters produce identical financial outputs regardless of scenario IDs or names.

## API contract

`POST /api/simulations/compare` accepts:

```json
{
  "start_date": "2026-09-01",
  "end_date": "2026-09-30",
  "scenarios": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Keep current strategy",
      "parameters": {}
    },
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "name": "Discount with assumed growth",
      "parameters": {
        "discount_pct": "10",
        "expected_conversion_rate": "4",
        "visitor_change_pct": "10"
      }
    }
  ]
}
```

Pydantic requires 2–4 configurations, unique UUIDs and names of 1–80 characters after trimming. Names need not be unique; identity is always the UUID. Dates are required, ordered, inclusive in the store timezone, and bounded to 366 days. `SimulationPeriod` now shares the existing date validator between preview and comparison. Each scenario uses the exact seven Phase 05 parameter definitions and defaults. Extra fields, tenant selectors, invalid parameters and raw nonfinite numeric inputs are rejected.

Response structure:

```text
model_version: "aggregate-v1"
snapshot_id: "sha256:<64 lowercase hex characters>"
store_id, currency, reporting_period
baseline: FinanceSummary
scenarios[]:
  id, name, parameters
  status: "ready" | "unavailable"
  simulated: existing SimulatedMetrics | null
  differences: existing SimulationDifferences | null
  comparison: ComparisonMetrics | null
  assumptions[], warnings[]
assumptions[], warnings[]             deduplicated shared lists
```

`ComparisonMetrics` includes `orders_change_pct`, `gross_profit_change_pct`, `operating_expenses_difference`, `operating_expenses_change_pct`, `advertising_expenditure_difference`, `advertising_expenditure_change_pct`, `conversion_rate_difference_pp` and `operating_profit_margin_difference_pp`. Existing revenue, order, gross-profit and operating-profit absolute differences and revenue/profit percentages remain in `differences`.

The result preserves input order and each scenario's identity. Money and percentages serialize as strings; expected quantities use six decimal places. Missing or unsupported baselines produce per-scenario unavailable results without invented values. A comparison may contain ready and unavailable scenarios, for example when an inherited historical conversion above 100% is unsupported but another scenario supplies an explicit valid assumption. A negative resulting advertising budget rejects the whole request with 422 and identifies the offending scenario. Existing 404/503/500 and JSON-safe validation errors remain in use.

The configured demo organization/store and their demo flags remain the only public scope. There is no additional repository query per scenario and no business-data mutation. [The OpenAPI export](openapi.json) and [API handoff](api.md) include the endpoint.

## Reproducible local example

[phase-06-comparison-example.json](phase-06-comparison-example.json) records the actual response to the request above using the unchanged September seed:

| Metric | Current strategy | Discount with assumed growth |
| --- | ---: | ---: |
| Expected orders | 342.000000 | 511.940000 |
| Revenue, USD | 29,371.63 | 39,569.77 |
| Operating profit, USD | 10,182.18 | 14,436.59 |
| Revenue difference, USD | 0.00 | +10,198.14 |
| Operating-profit difference, USD | 0.00 | +4,254.41 |
| Operating-expense difference, USD | 0.00 | +524.53 |
| Conversion difference, percentage points | 0.000000 | +1.060593 |

The second result assumes 10% more visitors and 4% conversion. Neither increase is inferred from the 10% discount. The comparison uses the same historical financial definitions documented in [Phase 05](phase-05-report.md).

## Interface and manual evaluation

The `/simulation-lab` page retains **Single scenario** as its initial mode and adds **A/B Arena** beside it. Both use the existing baseline and date controls. Arena editors use React Hook Form, `useFieldArray`, shared Zod parameter validation, the current Button component and existing styles. Duplication copies values and creates a new UUID. Removing scenarios stops at two; adding or duplicating stops at four. Reset restores two default drafts and clears results, selection and exclusions.

The comparison table displays the historical baseline alongside each scenario, including revenue, expected orders/visitors, assumed conversion, COGS, gross profit/margin, operating expenses, advertising, operating profit/margin and available deltas. Green identifies profit improvements; red identifies losses or profit declines. Revenue and cost changes are shown without declaring them automatically favorable. Tradeoff text explains that higher revenue can coexist with a loss and that lower spend can constrain activity.

A Recharts bar chart compares revenue and operating profit. Exact decimal money strings feed labels/tooltips through the existing BigInt formatter; Number conversion is limited to chart coordinates and count/percentage presentation. Missing projections are never converted to zero. Per-scenario disclosures retain IDs, applied inputs, assumptions and warnings.

No scenario is selected automatically. Users can select a ready scenario, exclude/reinclude scenarios, or return to parameter editing. Excluded scenarios remain visible in the table, are removed from the chart and cannot be selected. Excluding the selected scenario clears selection. These decisions are local interface state and do not change calculations or historical records.

Editing names/parameters, adding/removing scenarios, resetting or changing dates clears the published comparison and aborts pending work. Stale success/error responses are ignored. A successful response updates the displayed baseline to the shared authoritative snapshot without invalidating its own results. Loading, invalid inputs, failure/retry and unavailable projections have explicit states. Switching away from Arena unmounts its drafts; scenarios are not saved between visits.

## Verification

Executed with Node 24.19.0, Python 3.12.14 and local PostgreSQL 16.2 on macOS Apple Silicon:

| Check | Result |
| --- | --- |
| Full backend suite against disposable PostgreSQL | **429 passed**, no skips/failures, 16.33 seconds |
| Focused new comparison database/API tests | **21 passed**, included above |
| Full frontend suite | **59 passed**, including 10 new Arena contract/form/lifecycle tests |
| TypeScript and Vite production build | **Passed**, including finalized frontend tests and warning labels |
| Full Chromium suite against real API/PostgreSQL and production build | **27 passed**, 16.4 seconds on the final build, including the finalized display labels |
| Desktop and 375px mobile screenshots | Reviewed; comparison table scrolls inside its panel, chart renders and page width stays within viewport |

Backend tests prove two/four-scenario behavior, independent mixed-VAT/refund/expense amounts, preview parity, identity, losses, zero-denominator policy, missing/mixed availability, one baseline call, the same object per simulation, unchanged query count between two and four scenarios, deterministic fingerprints, input validation and unchanged business-row fingerprints. A real HTTP dependency test verifies PostgreSQL read-only and repeatable-read transaction settings.

Frontend tests cover request/response validation, string preservation, 2–4 editing operations, manual selection/exclusion, reset, period invalidation, error/retry, unavailable data, deferred stale successes/errors and unmount cancellation. Four added real browser workflows cover side-by-side decisions including a higher-revenue loss, all scenario operations, empty historical periods and mobile results. All 23 existing dashboard/single-scenario browser tests passed.

Commands:

```sh
TEST_DATABASE_URL='<local isolated rdl_test_* URL>' .venv/bin/python -m pytest -c backend/pytest.ini backend/tests
npm test
npm run build
TEST_DATABASE_URL='<dedicated seeded local browser URL>' npm run test:e2e
```

Existing nonblocking warnings remain: Starlette/AnyIO deprecation, Vite's bundle-size warning (approximately 887 kB before compression), and the Playwright color-environment warning. No dependency, migration or seed was added. Existing uncommitted Phase 05 work and persistent demo/admin/browser data were preserved. No database reset, commit, push or deployment was performed. Verification-owned HTTP servers and local PostgreSQL were stopped after testing; the stored local data remains intact.

## Files changed in Phase 06

This inventory is relative to the beginning of Phase 06, including already uncommitted Phase 05 source. It excludes earlier changes that were preserved unchanged.

Created:

- `backend/app/schemas/comparison.py`
- `backend/app/services/simulation_comparison.py`
- `backend/tests/test_comparison_database.py`
- `src/api/comparison.ts`
- `src/api/comparison.test.ts`
- `src/components/simulation-arena.tsx`
- `src/components/simulation-arena.test.tsx`
- `src/components/simulation-controls.ts`
- `src/hooks/use-comparison.ts`
- `src/hooks/use-comparison.test.tsx`
- `src/test/comparison-fixture.ts`
- `tests/e2e/comparison.spec.ts`
- `docs/phase-06-report.md`
- `docs/phase-06-comparison-example.json`

Modified:

- `backend/app/api/simulations.py`: add the compare route.
- `backend/app/schemas/simulation.py`: share existing reporting-period validation.
- `backend/app/main.py`: API version 0.6.0.
- `src/api/client.ts`: validated comparison POST.
- `src/api/simulation.ts`: export existing result schemas for reuse.
- `src/hooks/use-simulation.ts`: accept the authoritative comparison baseline.
- `src/pages/simulation-lab.tsx`: Arena mode, shared controls and date invalidation.
- `src/index.css`: minimal Arena layout, evaluation and comparison indicators.
- `src/App.tsx`, `src/components/layout.tsx`: current phase labels.
- `README.md`, `docs/api.md`, `docs/openapi.json`, `.github/workflows/verify.yml`: usage, API contract/export and verification label.

The Phase 05 pure simulation engine, finance engine, models, migrations, seed, package manifests, lockfiles and previous tests/reports were not rewritten.

## Limits and completion

All Phase 05 aggregate-model and accounting limits still apply: fixed product mix, assumed conversion/traffic, period-based refunds and costs, two-decimal currency precision, and operating profit rather than accounting net profit. Re-running after history changes can produce a different snapshot and result. No saved scenarios, durable snapshots, authentication, live experiments or automatic optimization are included. Supabase, Windows and hosted CI execution remain unverified.

The implemented comparison is for hypothetical manual evaluation. No unresolved local Phase 06 functional blocker remains. Implementation and verification completed before the October 12, 2026 16:00 Europe/Istanbul deadline. Phase 07 has not been started.
