# Phase 02 implementation and verification report

Phase 02 is implemented and verified against **real local PostgreSQL**. Live Supabase hosting remains unverified because no Supabase credentials were provided. The application is configured for Supabase through backend environment variables; it never substitutes mock data when the database is missing.

## Phase 01 baseline

Before edits, the existing 22 backend tests, 5 frontend tests and production build passed. The repository contained the previous phase as uncommitted files. Its working structure and UI were extended in place; no Git reset, checkout, commit or remote push was performed.

## Delivered

- Eight SQLAlchemy models in the private `retail` schema, UUID keys, NUMERIC/Decimal financial fields, indexed foreign keys and constraints. Order items retain price, discount, VAT and unit-cost snapshots. Composite foreign keys prevent linking products and orders from different stores.
- Explicit Alembic initial migration. No startup `create_all`, automatic migrations, table resets or destructive downgrade path.
- Deterministic, additive seed with a single transaction and stable IDs. Repeated execution preserves existing rows and operator edits.
- Backend-only psycopg connection configuration, SSL, bounded session/direct pooling, transaction-pooler support, read-only consistent request snapshots and clear database errors.
- Store-scoped repositories and database aggregation. `/api/products` and `/api/expenses` added; dashboard and health endpoints retained. Date validation and bounded pagination included.
- Frontend preserved: PostgreSQL/synthetic source labels, operating/advertising expense split, empty reporting-period state, existing loading/error/retry behavior.
- Updated Windows/macOS setup and native PostgreSQL CI matrix. Node dependencies, npm lockfile and line-ending configuration preserved.

## Changed files

| Area | Files |
| --- | --- |
| New database layer | `backend/app/db/{base,demo,models,session}.py`, `backend/app/db/__init__.py` |
| New migrations/seed | `backend/alembic.ini`, `backend/migrations/env.py`, `backend/migrations/script.py.mako`, `backend/migrations/versions/0001_retail_schema.py`, `backend/app/seed.py` |
| New data access/API | `backend/app/repositories/{__init__,retail}.py`, `backend/app/api/catalog.py`, `backend/app/schemas/catalog.py` |
| Backend updates | `backend/app/core/config.py`, `backend/app/main.py`, `backend/app/api/dashboard.py`, `backend/app/services/dashboard.py`, `backend/app/schemas/dashboard.py`, `backend/requirements.in`, `backend/requirements.txt`, `backend/.env.example` |
| Retired mock provider | Removed `backend/app/providers/mock_dashboard.py` and its empty package initializer; there is no mock fallback |
| Frontend updates | `src/api/schemas.ts`, `src/pages/dashboard.tsx`, `src/components/{kpi-card,layout}.tsx`, `src/App.tsx`, `index.html` |
| Tests/tooling | `backend/tests/{conftest,test_api,test_configuration,test_database}.py`, `src/api/schemas.test.ts`, `tests/e2e/dashboard.spec.ts`, `playwright.config.ts`, `.github/workflows/verify.yml`, `.gitignore` |
| Documentation | `README.md`, `docs/phase-02-report.md`; Phase 01 report retained as historical evidence |

## Persisted sample store

September 1–30, 2026, USD/UTC, explicitly synthetic: one organization, one store, 12 products, 377 orders, 660 order items, 37 expenses, 30 daily traffic records and 60 advertising records. Of the orders, 342 are completed.

| Metric | Value |
| --- | ---: |
| Revenue after line discounts, excluding VAT | $29,371.63 |
| Completed orders | 342 |
| Visitors | 11,635 |
| Conversion | 2.94% |
| Operating expenses excluding ads | $6,507.45 |
| Advertising expenditure | $1,776.00 |
| Total expenses | $8,283.45 |

These values were read from persisted records. Advertising uses `AdSpend` once; the advertising ledger mirror in `Expense` is excluded from operating expenses. Definitions and reporting boundaries are documented in the README.

## Executed checks

Environment: macOS arm64, Node 24.19.0, Python 3.12.14, PostgreSQL 16.2. The installed Homebrew could not recognize the host macOS version, so an isolated, ignored portable PostgreSQL binary was used for local verification; it is not an application dependency.

| Check | Result |
| --- | --- |
| Backend pytest | **101 passed**, including 18 PostgreSQL integration tests |
| Frontend Vitest | **12 passed** |
| TypeScript and production build | **Passed** |
| Chromium production integration | **8 passed** against PostgreSQL-backed FastAPI |
| Migration upgrade twice | **Passed**, no duplicate tables |
| `alembic check` | **Passed**, no model/migration drift |
| Seed twice | First run inserted demo records; second inserted **0** records in every table |
| PostgreSQL migration SQL generation without credentials | **Passed** |
| Dependency consistency (`pip check`) | **Passed** |
| Desktop/mobile screenshots | Reviewed; existing layout retained |

Tests cover model relationships, FK and cross-store integrity, Decimal precision, historical snapshots, independent aggregation, ad deduplication, reporting boundaries, empty periods, response schemas, tenant selectors, pooling/SSL, missing configuration and actual connection refusal. Browser tests verify actual stored metrics, products/expenses, loading, empty results and retry recovery.

The pytest fixtures accept only an explicit loopback `TEST_DATABASE_URL` with a `rdl_test_` database name. They create/drop only their own random UUID-named database; the administrative entry database is not altered. Browser tests also require a dedicated local test database. No shared Supabase database was accessed or modified.

## Remaining verification and run instructions

- **Supabase live connection was not tested.** Set `DATABASE_URL` privately in `backend/.env`; set `MIGRATION_DATABASE_URL` to a direct/session URL when using transaction pooling. SSL/pool variables are documented in `backend/.env.example` and the README. No Supabase Auth or API key is required.
- **Windows and remote GitHub Actions were not run.** The workflow provisions PostgreSQL 17 on Windows/macOS; local verification used PostgreSQL 16.2.
- One upstream Starlette/AnyIO deprecation warning remains; all checks pass. All store records are synthetic.
- No authentication, AI, simulation, optimization, Monte Carlo or A/B experimentation was added. Development stops at Phase 02.

After the [platform setup](../README.md), run migrations with the virtual environment's Python from the project root:

```text
python -m alembic -c backend/alembic.ini upgrade head
```

Then, from `backend`, run `python -m app.seed`. Start `npm run backend -- --reload` and `npm run dev` in separate terminals at the project root. Open `http://127.0.0.1:5173`. Use the explicit Windows/macOS Python paths shown in the README if the virtual environment is not activated.

The verified local database files remain under ignored `.local/postgres-data`; no generated database contents or credentials are included in source control. Temporary HTTP/test processes and the locally started PostgreSQL server were stopped after verification.
