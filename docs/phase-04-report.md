# Phase 04 — Dashboard and Business Analytics Integration

This phase adds reporting filters and business analytics to the existing dashboard. Financial values remain authoritative outputs of the Phase 03 Decimal engine. No AI, simulations, optimization, Monte Carlo, A/B testing or Phase 05 work is included.

## Scope and reporting contract

The new `GET /api/analytics/dashboard` endpoint returns the financial summary, daily series, product performance and expense breakdown in one response. A request uses the existing read-only, repeatable-read database session, so the displayed sections share the same store, period and database snapshot. Existing finance, legacy dashboard, product and expense APIs retain their contracts.

Response structure:

```text
summary                              Phase 03 FinanceSummary
store_timezone, as_of_date           Store-local reporting context
selected_preset                      demo, custom, last_7_days, last_30_days, last_90_days
daily[]                              Date, revenue, orders, visitors, conversion, costs, profits, completeness
products[]                           Product identity, sold/returned units, net merchandise revenue, COGS, gross profit/margin
expenses[]                           Named engine-derived expense buckets
unallocated_customer_shipping_revenue Customer shipping kept separate from products
product_warnings[]                   Product attribution and completeness limits
```

Money and percentages remain decimal strings or explicit `null`; React only formats backend results. The browser does not calculate profits, margins, totals or conversion. All API queries remain restricted to the fixed demo organization/store and their demo flags. Unknown tenant selectors are rejected.

## Date semantics

- `?preset=last_7_days`, `last_30_days` or `last_90_days` ends on the current calendar date in the store's timezone, including today. Start is that date minus N−1 calendar days. Today may be partial.
- `?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` selects custom inclusive dates.
- A request without filters preserves the existing September 1–30, 2026 sample period, clearly labeled **Sample period** in the interface. Presets are never silently anchored to the last seeded transaction.
- Presets and explicit dates cannot be mixed. Both custom dates are required, in order, with at most 366 inclusive days. Unsafe year boundaries and unknown parameters are rejected with 422. The bound applies to the new analytics endpoint; existing financial API date contracts remain unchanged.
- Timestamp selection uses store-local midnight to midnight following the final day, converted to UTC independently. Daily grouping uses the same store timezone, including daylight-saving transitions. Costs and traffic use their recorded calendar dates.
- Every selected calendar day is included in daily series. No recorded monetary events means zero recorded amounts. A missing traffic row yields `visitors: null` and `conversion_rate: null`; a recorded zero remains zero. Missing data is never silently drawn as a measured zero.

## Calculations and attribution

The existing financial engine calculates the period summary and the daily/product subsets. PostgreSQL records are loaded in a bounded batch of scoped queries, then grouped in memory. There is no per-day or per-product database loading and no cache. Original price, discount, VAT and cost snapshots drive historical results; editing product catalog prices does not alter profit.

Daily additive money and order counts reconcile with the selected-period summary when data is complete. Ratios must be taken from their respective engine outputs: daily conversion or margins are not averaged to obtain period conversion or margins. Refunds use their own event date and original item snapshots, including refunds of sales outside the selected period.

Product revenue means net **merchandise** revenue, after line discounts and dated refunds. Units sold are gross sold units, with returned units shown separately. Product COGS uses historical costs and explicit restock reversals. Customer shipping is reported separately and is not distributed across products. Operating expenses and advertising are not allocated to products, so product tables show gross profit rather than operating profit. Product names/SKUs are current catalog labels because historical label snapshots do not exist. Missing item or refund information is surfaced as completeness/attribution warnings rather than an invented allocation.

Expense categories are employee costs, rent, carrier shipping, platform fees, other operating expenses (software plus miscellaneous), and advertising. They use the engine's established policy: `AdSpend` is authoritative; advertising mirrors in `Expense` are excluded. The revenue-versus-operating-expenses chart excludes advertising from its operating-expense series, as the Phase 03 definition requires. The separate expense chart includes advertising once. Neither comparison is labeled profit.

## Interface

The existing dashboard design and six KPI cards are retained. The report details include order count, visitors, AOV, historical COGS, advertising, gross margin and the existing financial totals, completing the requested metric set.

Date filters apply one analytics response to all sections. Superseded requests are aborted and ignored. Loading, error/retry, invalid range, empty results and incomplete data have explicit states. Analytics navigation points to the functional section on the same dashboard; future modules remain disabled.

Six Recharts views present daily revenue, daily orders, visitors/conversion, revenue versus operating expenses, product sales performance and expense breakdown. Tables expose the exact backend values alongside the graphics. Charts preserve null gaps, label currencies/counts/percentages, and disable decorative animation. Layout remains responsive without a design-system replacement or new dependencies.

## Verification

Initial baseline before changes: **228 backend tests, 19 frontend tests and the production build passed** on macOS Apple Silicon with Python 3.12.14, Node 24.19.0 and PostgreSQL 16.2.

| Executed check | Result |
| --- | --- |
| Full backend suite against isolated PostgreSQL | **279 passed**, no skips or failures, 14.23 seconds. Includes all 228 prior tests and 51 analytics cases. |
| Frontend unit/component/hook tests | **34 passed**, including all 19 prior tests. |
| TypeScript and Vite production build | **Passed**, including the final isolated-point chart correction. |
| Chromium tests against the production build and real PostgreSQL API | **18 passed**, 11.3 seconds. |
| Desktop and 375px mobile screenshots | Visually reviewed; charts render, tables scroll within their panels, no page-width overflow. |
| Batched query performance | At most **10 SELECTs** per report; query count remains constant within one optional query across 7-, 90- and 366-day reports. |
| Financial reconciliation | Summary matches FinanceService for the same dates; complete daily and product merchandise amounts reconcile to the financial totals, with customer shipping separate. |

Backend tests use independent expected monetary values for mixed VAT, discounts, current/older-sale refunds, historical COGS, product margins and expenses. They also cover changed catalog prices, unknown VAT/refund/item data, measured zero versus missing traffic, empty days, tenant isolation, invalid ranges, leap-year maximum ranges, six frozen-clock/store-timezone preset cases and a 25-hour DST day. The existing disposable database fixtures create/drop only their own UUID-named test databases.

Frontend tests cover request serialization, date validation, response contracts, null preservation, loading, error/retry and stale success/error cancellation after filter changes. Browser tests exercise every preset, a custom range, invalid custom dates, product/expense values, real daily losses, existing API compatibility, analytics navigation, empty periods, incomplete warnings and responsive rendering. A final regression verifies that isolated known revenue/conversion values remain visible between missing days; small point markers preserve those measurements without connecting gaps.

Commands executed from the repository root used the pinned runtime paths:

```sh
TEST_DATABASE_URL='<isolated local rdl_test_* PostgreSQL URL>' .venv/bin/python -m pytest -c backend/pytest.ini backend/tests
npm test
npm run build
TEST_DATABASE_URL='<dedicated local browser test URL>' npm run test:e2e
```

The administrative test database and existing demo/browser data were preserved. Browser-owned backend and preview servers stopped after testing. Local PostgreSQL was started only for verification and its persisted data remains available under ignored `.local/postgres-data`. No schema migration was necessary.

The seeded September report still returns revenue **29,371.63 USD**, gross profit **18,465.63 USD**, operating profit **10,182.18 USD** and operating margin **34.67%**, with 30 daily rows and 12 product rows. Product merchandise revenue totals **29,371.63 USD**; customer shipping is **0.00 USD**. The six expense categories total **8,283.45 USD**, including advertising once.

## Files changed

New files:

- `backend/app/api/analytics.py`
- `backend/app/schemas/analytics.py`
- `backend/app/services/analytics.py`
- `backend/tests/test_analytics_database.py`
- `src/components/analytics.tsx`
- `src/components/reporting-filter.tsx`
- `src/components/reporting-filter.test.tsx`
- `src/api/analytics.test.ts`
- `src/hooks/use-dashboard.test.tsx`
- `src/test/analytics-fixture.ts`
- `docs/phase-04-report.md`

Modified files:

- `backend/app/repositories/finance.py`: reusable record loading and engine-input construction; existing finance entry point retained.
- `backend/app/main.py`: analytics route registration and API version 0.4.0.
- `src/api/client.ts`, `src/api/schemas.ts`: typed analytics contract and filter query serialization; prior client/schema contracts retained.
- `src/hooks/use-dashboard.ts`, `src/pages/dashboard.tsx`: atomic analytics requests, filters, complete metric details and chart integration.
- `src/components/layout.tsx`, `src/App.tsx`, `index.html`: functional analytics navigation and phase labels.
- `src/index.css`: form, chart and scrollable table styles within the existing design.
- `tests/e2e/dashboard.spec.ts`: previous scenarios adapted to the analytics request and seven additional browser scenarios.
- `README.md`, `.github/workflows/verify.yml`: usage/reporting documentation and verification phase label.

The pure financial engine, database schema, migration history, seed data, dependency manifests and lockfiles were unchanged. Previous phase reports and original unit tests were retained. Existing uncommitted/untracked project files were preserved; no commit, push or deployment was performed.

## Known limits

This remains a synthetic demo without authentication. Current-day presets can include a partial day, and the fixed September sample does not provide traffic measurements for every current-date preset. Financial completeness indicators report known gaps, not proof that all business events were recorded. Missing visitor dates produce a null period conversion.

Phase 03 accounting assumptions remain: operating profit is not accounting net profit; two-decimal currency precision, booked expense/cost basis, per-credit-note rounding residuals and explicit refund/restock data are retained. Customer-shipping refunds and complete accounting reconciliation remain outside the model. Costs are recognized on stored dates; monthly rent is not spread across days. No historical product label changes can be reconstructed.

Live Supabase, Windows and hosted CI execution remain unverified. The backend suite reports the existing Starlette/AnyIO deprecation warning. Vite reports a bundle-size warning (approximately 803 kB before compression) now that the already-installed Recharts library is used; production compilation succeeds. No new dependencies or caching infrastructure were introduced.

No unresolved functional blocker remains for local Phase 04. The application is ready for the next phase, which has not been started.
