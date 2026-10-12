# Phase 03 completion report

Implemented and locally verified on October 12, 2026. Work stops at Phase 03.

## Delivered

- Pure, reusable Pydantic/Decimal finance engine with explicit two-decimal `ROUND_HALF_UP` arithmetic and independent unit tests.
- Gross sales, discounts, VAT-exclusive merchandise revenue, customer shipping, VAT collected/refunded, refunds, net revenue, historical COGS and restock reversals, gross/contribution/operating profit and margins, category expenses, advertising, AOV, conversion and break-even order quantity.
- Database-backed `GET /api/finance/summary`, paired date filters, store timezone boundaries, fixed demo scope, decimal-string responses and explicit incomplete-data nulls/warnings.
- Single authoritative advertising source (`AdSpend`); the Expense advertising mirror is excluded. Customer shipping charges and carrier costs remain separate.
- Six dashboard KPI cards using the finance endpoint, preserving the design, loading/error/retry behavior, negative values and empty state. Unknown metrics display “Unavailable”.
- Phase 02 dashboard API retained and explicitly deprecated as a compatibility contract. All original backend/frontend tests remain passing.

## Files

New backend implementation:

- `backend/app/services/finance/__init__.py`
- `backend/app/services/finance/types.py`
- `backend/app/services/finance/calculations.py`
- `backend/app/repositories/finance.py`
- `backend/app/services/financial_reporting.py`
- `backend/app/schemas/finance.py`
- `backend/app/api/finance.py`
- `backend/migrations/versions/0002_financial_snapshots.py`

New tests and documentation:

- `backend/tests/test_finance_calculations.py`
- `backend/tests/test_finance_database.py`
- `backend/tests/test_finance_migration.py`
- `src/api/finance.test.ts`
- `docs/phase-03-financial-engine.md`
- `docs/phase-03-summary-example.json`
- `docs/phase-03-report.md`

Modified:

- Backend: `backend/app/db/models.py`, `backend/app/seed.py`, `backend/app/main.py`, `backend/app/api/dashboard.py`.
- Frontend: `src/api/client.ts`, `src/api/schemas.ts`, `src/hooks/use-dashboard.ts`, `src/pages/dashboard.tsx`, `src/components/kpi-card.tsx`, `src/components/layout.tsx`, `src/App.tsx`, `index.html`.
- Verification/documentation: `tests/e2e/dashboard.spec.ts`, `.github/workflows/verify.yml` (phase label only), `README.md`.

No dependencies were added or changed. Previous phase reports and original unit-test files were preserved. Existing workspace changes were retained; the repository still contains its previously untracked project files. No commit, push or deployment was performed.

## Migration and data preservation

Revision `0002_financial_snapshots` follows `0001_retail_schema`. It adds explicit nullable item VAT basis, nullable customer shipping fields, a dated refund table with same-store foreign keys and validation, refunded order statuses, and platform-fee expenses. `Order.status` expands to 24 characters for `partially_refunded`. Destructive downgrade remains disabled.

The migration backfills only the 660 known deterministic synthetic item IDs and 377 order IDs inside the correctly flagged USD/UTC demo store and organization. Their established Phase 02 semantics are tax-exclusive prices and zero customer shipping charges. Other historical records remain NULL. No refund amounts or events were invented.

Both existing local databases, `rdl_demo` and `rdl_test_browser`, were upgraded forward without reset. Every pre-existing table's ordered original-column contents were hashed before and after migration; all values and counts matched. Repeated upgrades were no-ops. Alembic reported **no new upgrade operations**. Two seed reruns on each database inserted zero rows. Counts remain 1 organization, 1 store, 12 products, 377 orders, 660 items, 37 expenses, 30 daily traffic records and 60 ad-spend records, with zero seeded refunds.

Independent migration tests additionally build a disposable Phase 02 database, populate old-shape records and unknown metadata, upgrade it, and verify row preservation, selective backfill, both demo flags, constraints and model/schema agreement. Test fixtures create/drop only their own UUID-named local databases; the administrative entry database is not migrated, seeded or dropped.

## Verification executed

| Check | Result |
| --- | --- |
| Initial baseline | 101 existing backend tests, 12 frontend tests and production build passed before implementation. |
| Full backend suite against isolated PostgreSQL | **228 passed**, no skips or failures, 12.95 seconds. |
| Pure finance tests | **71 passed**, without a database. |
| New finance database/API tests | **39 passed** within the full suite. |
| New migration/storage tests | **17 passed** within the full suite. |
| Frontend unit tests | **19 passed**, including all 12 original tests. |
| TypeScript and Vite production build | Passed. |
| Chromium production-browser suite | **11 passed** against the migrated/seeded PostgreSQL browser-test database. |
| Desktop/mobile visual inspection | Six cards and details readable; mobile width has no horizontal overflow. |
| Migration rerun, seed rerun, schema drift and original data preservation | Passed for both existing local databases. |
| Offline migration SQL generation | Passed through revision 0002. |

The 228 backend tests include the original 101 plus 127 new cases. Independent financial fixtures verify expected amounts rather than calling production calculations to produce expectations. Coverage includes mixed VAT and discounts, refunds and restocking, unknown semantics (including an older sale whose refund cash limit cannot be verified), missing traffic, zero/negative results, rounding, break-even, historical product changes, advertising double counting, status/date filtering, a 25-hour DST day, foreign keys and demo isolation.

Review also identified and fixed two edge cases with regressions: valid partial cash refunds whose independently rounded VAT-exclusive totals differ by a cent, and completed refund events incorrectly dated before the original sale. Cumulative cash over-refunds and quantity overreturns return a clear invalid-history error.

Commands used the pinned Python 3.12.14 environment and Node 24.19.0. PostgreSQL was 16.2 on macOS Apple Silicon. The only backend warning was an existing Starlette/AnyIO `BlockingPortal` deprecation; it did not affect results. Browser tests started and stopped their own backend and preview processes. Local PostgreSQL data was preserved after verification.

## Database-derived September example

| Metric | Value |
| --- | ---: |
| Revenue | USD 29,371.63 |
| COGS | USD 10,906.00 |
| Gross profit / margin | USD 18,465.63 / 62.87% |
| Contribution profit / margin | USD 15,634.03 / 53.23% |
| Operating expenses | USD 6,507.45 |
| Advertising | USD 1,776.00 |
| Operating profit / margin | USD 10,182.18 / 34.67% |
| AOV | USD 85.88 |
| Orders / visitors / conversion | 342 / 11,635 / 2.94% |
| Break-even order quantity | 120 |
| Completeness | All detectable conditions complete; 30/30 traffic days. |

Full exact decimal-string output is in [phase-03-summary-example.json](phase-03-summary-example.json).

## Remaining limits and blockers

No unresolved blocker remains for local Phase 03 functionality. Live Supabase credentials were not supplied, so hosted connectivity and hosted migration execution remain unverified. Windows and hosted CI execution were not performed locally; the existing cross-platform workflow remains available.

The report calculates operating profit, not accounting net profit or income tax. Expense/COGS tax basis, fixed-versus-variable cost classification and invoice rounding need merchant validation. Two-decimal currencies only are supported. Per-refund rounding can leave documented cent-level revenue/VAT residuals on split full refunds. Customer-shipping refunds and full accounting/inventory/credit-note reconciliation are outside this data model. Completeness flags cannot discover entirely unrecorded transactions.

The deprecated Phase 02 endpoint retains its original assumptions and does not support the new refund/mixed-tax semantics; financial consumers must use `/api/finance/summary`. The dashboard already does so. No AI, simulation, Monte Carlo, optimization, A/B testing, authentication or Phase 04 work was started.

See [the financial engine specification](phase-03-financial-engine.md) for every formula, status rule, rounding convention and limitation.
