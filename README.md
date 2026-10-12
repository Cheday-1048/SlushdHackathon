# saleslab.AI — Phase 08

A React application backed by FastAPI and persistent PostgreSQL records for one **synthetic retail store**. Phase 08 adds a minimal AI Decision Assistant: OpenAI interprets a natural-language goal and calls two validated backend tools to retrieve historical metrics and invoke the existing Goal Optimizer. Financial results and explanations come from the existing services. Calculated strategies can be sent to the existing A/B Arena. Dashboard, single-scenario, comparison and manual optimization workflows remain available. Authentication, probabilistic modeling and real-world experimentation remain outside this phase.

See the [Phase 08 assistant report](docs/phase-08-report.md), [Phase 07 optimization report](docs/phase-07-report.md), [actual optimization response](docs/phase-07-optimization-example.json), [Phase 06 Arena report](docs/phase-06-report.md), and [financial definitions and assumptions](docs/phase-03-financial-engine.md).

GitHub target: [Cheday-1048/SlushdHackathon](https://github.com/Cheday-1048/SlushdHackathon). See [the two-developer workflow](docs/contributing.md) for cloning, branch ownership and integration, and [the API handoff](docs/api.md) for request/response contracts. Publication status is recorded in [the import report](docs/github-import-report.md).

Supabase is the intended PostgreSQL host. Its credentials were not supplied during development, so a live Supabase connection has **not** been verified. Local PostgreSQL verification and its limits are recorded in [the Phase 07 report](docs/phase-07-report.md).

## Architecture and stack

```text
src/
  api/             Typed fetch client and Zod response validation
  components/      App shell (layout/), dashboard widgets (dashboard/), analytics charts, reporting filter
  design-system/   Design tokens, theme/accent/density/motion providers, background styles
  shared/          UI primitives (button, card, dialog, …) and layout helpers built on the design system
  hooks/           Loading, error and retry lifecycle, media-query and focus helpers
  lib/             Display-only formatting
  pages/           Dashboard, Simulation Lab (scenarios, A/B Arena, Goal Optimizer, AI assistant) and Guide
backend/app/
  api/             Health, analytics, finance, simulations, legacy dashboard and catalog routes
  core/            Environment configuration
  db/              SQLAlchemy models, connection management and demo IDs
  repositories/    Scoped transaction, refund, cost and traffic queries
  schemas/         Pydantic API contracts
  services/        Analytics/reporting plus pure finance/ and simulation/ arithmetic
  seed.py          Deterministic, additive synthetic seed
backend/migrations/ Version-controlled Alembic revisions
backend/tests/     Unit and isolated PostgreSQL integration tests
tests/e2e/         Chromium tests against FastAPI and the production build
scripts/          Cross-platform backend launcher
```

React calls FastAPI; backend routes call services/repositories through a request-scoped database session. Browser code never connects to PostgreSQL. Each data request uses a read-only, repeatable-read transaction so its queries share one snapshot.

The nine models are `Organization`, `Store`, `Product`, `Order`, `OrderItem`, `Refund`, `Expense`, `DailyTraffic` and `AdSpend`. They live in the `retail` schema with UUID keys, foreign keys, indexes, positive/nonnegative checks and store-level SKU, order-number and traffic-date uniqueness. Composite foreign keys prevent an order item from linking an order and product belonging to different stores. Money uses PostgreSQL `NUMERIC(14,2)` and Python `Decimal`; VAT percentages use `NUMERIC(5,2)`. Order-item prices, discounts, VAT and costs are historical snapshots. Order totals are derived from their lines. Nullable fields record item tax basis and customer shipping; dated refunds reference original item snapshots. Unknown monetary semantics are surfaced rather than assumed.

Only the fixed demo organization/store IDs with both `is_demo` flags are accessible through the public API. There are no organization/store query selectors; unknown parameters return 422. Keep `retail` out of Supabase's **exposed API schemas**. These boundaries support the unauthenticated demo; authentication and permissions for real tenants belong to a later phase.

Pinned backend versions include FastAPI **0.115.12**, Pydantic **2.11.3**, SQLAlchemy **2.0.54**, Alembic **1.20.0**, psycopg **3.3.6** and pytest **8.3.5**. The frontend uses React, TypeScript, Vite, React Router, Tailwind CSS v4, Zod, Lucide, Motion, Radix UI and Recharts on a shared design system (see [UI integration](docs/ui-integration.md) for the template mapping). Existing optional UI libraries remain installed without adding future features.

## Prerequisites

- Node.js **24.19.0**, pinned in `.nvmrc`, and npm.
- Python **3.12.14**, pinned in `.python-version`; Python 3.12 is the supported minor version.
- A Supabase PostgreSQL project for hosted use. For integration tests, install a local PostgreSQL server and its `createdb`/`psql` tools using the [official platform downloads](https://www.postgresql.org/download/). PostgreSQL 17 matches CI; development was also verified against local PostgreSQL 16.2 on Apple Silicon.

Use native arm64 Node and Python on Apple Silicon. Docker is not required. Use `npm ci` to preserve `package-lock.json`. `backend/requirements.txt` locks Python dependencies, including the Windows-only `colorama` marker; `requirements.in` records direct dependencies. Preserve `.gitattributes` line-ending rules.

## Install dependencies

Run the commands for your OS from the repository root. Copy the environment examples only for a new checkout; retain any existing `.env` values.

macOS:

```sh
node --version
python3 --version
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm ci
cp .env.example .env
cp backend/.env.example backend/.env
```

Windows PowerShell:

```powershell
node --version
py -3.12 --version
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm ci
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env
```

Directly invoking the virtual-environment executable avoids PowerShell execution-policy changes.

## Supabase connection and configuration

Create/open your Supabase project, select **Connect**, and copy the PostgreSQL connection string for the chosen mode into `backend/.env` as `DATABASE_URL`. Supply the database password and percent-encode reserved characters. Copy the provided host, port and username exactly; a Supabase project URL or anon key is not a PostgreSQL connection string.

| Deployment | Connection | `RDL_DB_POOL_MODE` |
| --- | --- | --- |
| Persistent backend on an IPv4-only network | Shared session pooler | `session` |
| Persistent backend with IPv6, or the IPv4 add-on | Direct connection | `direct` |
| Transient/serverless backend | Transaction pooler | `transaction` |

These choices follow [Supabase's connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres). Use a direct connection for migrations when available, or a session connection on IPv4. Set `MIGRATION_DATABASE_URL` when the runtime uses transaction pooling; migrations reject transaction mode/port 6543. With direct/session runtime connections, migrations can reuse `DATABASE_URL`.

| Location | Variable | Default / purpose |
| --- | --- | --- |
| Root `.env` | `VITE_API_BASE_URL` | `http://127.0.0.1:8000`; public backend URL |
| `backend/.env` | `DATABASE_URL` | Required PostgreSQL connection secret |
| `backend/.env` | `MIGRATION_DATABASE_URL` | Optional direct/session secret; required for transaction-pooled runtime |
| `backend/.env` | `RDL_DB_POOL_MODE` | `session`; also accepts `direct` or `transaction` |
| `backend/.env` | `RDL_DB_SSLMODE` | `require`; `verify-full` also supported |
| `backend/.env` | `RDL_DB_SSL_ROOT_CERT` | Optional path to the downloaded server CA certificate |
| `backend/.env` | `RDL_DB_POOL_SIZE` / `RDL_DB_MAX_OVERFLOW` | `5` / `0` for direct/session connections, per process |
| `backend/.env` | `RDL_DB_POOL_TIMEOUT` | `3` seconds waiting for an application pool connection |
| `backend/.env` | `RDL_DB_CONNECT_TIMEOUT` | `3` seconds establishing a connection |
| `backend/.env` | `RDL_DB_STATEMENT_TIMEOUT_MS` | `5000` milliseconds per API statement |
| `backend/.env` | `RDL_SERVICE_NAME` | `Retail Decision Lab API` |
| `backend/.env` | `RDL_CORS_ORIGINS` | JSON array of exact browser origins |

SSL is required by default. For server identity verification, use `RDL_DB_SSLMODE=verify-full` with `RDL_DB_SSL_ROOT_CERT` pointing to the Supabase CA certificate. `sslmode=disable` is accepted only for literal local hosts (`localhost`, `127.0.0.1`, `::1`). A URL's `sslmode` takes precedence over the default setting.

Direct/session mode uses a bounded SQLAlchemy connection pool. Transaction mode and migrations use `NullPool`; psycopg automatic prepared statements are disabled with `prepare_threshold=None`, following [Supabase's psycopg instructions](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL). Connection and statement timeouts make unavailable databases fail clearly.

Keep credentials in the backend environment or deployment secret manager, never in `VITE_` variables. Examples contain no secrets; `.env` files and generated artifacts are ignored by Git. Backend configuration resolves `backend/.env` through `pathlib`, independent of the working directory. Restart the backend after changes. Vite reads its variables at startup/build time; restart or rebuild after edits.

## Migrate and seed

After configuring the connection, run Alembic from the repository root and seed from `backend`.

macOS:

```sh
.venv/bin/python -m alembic -c backend/alembic.ini upgrade head
cd backend
../.venv/bin/python -m app.seed
cd ..
```

Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m alembic -c backend\alembic.ini upgrade head
Push-Location backend
..\.venv\Scripts\python.exe -m app.seed
Pop-Location
```

Running `upgrade head` twice is safe: Alembic tracks the applied revision in `retail.alembic_version`. The seed uses fixed UUIDs and a single transaction to insert missing rows; existing records and unrelated stores are preserved. A second unchanged run reports zero inserted rows. Reserved-ID collisions outside the expected synthetic scope fail explicitly.

Phase 03 revision `0002_financial_snapshots` adds nullable VAT/shipping metadata, a refund ledger, refunded order statuses and platform-fee expenses. It backfills only known deterministic demo records using the documented Phase 02 conventions. Unknown records stay ambiguous, and no refund events are invented. Apply `upgrade head` to an existing database; do not reset it.

Startup does not create tables, migrate or seed automatically. Schema changes use version-controlled revisions rather than `create_all`. Destructive downgrade is disabled; recovery changes require a reviewed forward migration.

The USD/UTC store contains September 1–30, 2026 data: 12 products, 377 orders (342 completed), 660 order items, 37 expense records, 30 daily traffic records and 60 advertising-spend records. Names, order numbers and the API source label identify the data as synthetic. Product stock represents the current sample stock balance, not a reconstructed inventory history.

## Start the application

From the repository root, start the backend in one terminal:

```sh
npm run backend -- --reload
```

Start the frontend in another:

```sh
npm run dev
```

The backend launcher locates `.venv` using platform-independent paths. Set `RDL_PYTHON` only if you need a different interpreter. Alternatively, run `.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload` on macOS, or replace the executable with `.\.venv\Scripts\python.exe` on Windows.

Open [the dashboard](http://127.0.0.1:5173) and [FastAPI's API documentation](http://127.0.0.1:8000/docs). For the production build, run `npm run build`, then `npm run preview`, and open port 4173. Default CORS origins cover `localhost` and `127.0.0.1` on ports 5173 and 4173. Stop conflicting servers before starting these commands. If port 5173 is taken, run `npm run dev -- --port 5174` and start the backend with `RDL_CORS_ORIGINS` set to a JSON array that includes the new origin.

Without a configured `DATABASE_URL` the application still opens, but the dashboard shows "DATABASE_URL is not configured". That is the expected backend response, not a frontend error; configure the database and run the migration and seed steps above to see data.

## Demo Mode

Set `VITE_DEMO_MODE=true` (in `.env`, or in the hosting provider's build settings) to run the app on the bundled sample business, Nova Commerce (September 2026). No backend or PostgreSQL connection is needed and no request goes to a local API. The data is the backend's own synthetic dataset, so Dashboard and Analytics show the same figures as the real stack, and every reporting period works. The interface shows a "Demo Mode · Synthetic Data" label. Simulation Lab and the AI assistant need the backend and explain that in Demo Mode. See [UI integration](docs/ui-integration.md#demo-mode-vite_demo_modetrue). `vercel.json` enables Demo Mode for Vercel builds.

## API contracts and metric definitions

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Liveness only: `{ "status": "ok", "service": "Retail Decision Lab API" }`. Does not claim database readiness. |
| `GET /api/analytics/dashboard` | One scoped reporting snapshot: finance summary, daily series, product performance, expense categories, store timezone and current store date. |
| `GET /api/finance/summary` | Authoritative financial report: VAT-exclusive revenue, historical COGS, gross/contribution/operating profits, expense buckets, returns, margins, break-even and completeness. |
| `POST /api/simulations/preview` | Read-only hypothetical scenario with explicit dates and seven validated parameters; returns the authoritative baseline, projections, differences, assumptions and warnings. |
| `POST /api/simulations/compare` | Compare 2–4 named scenarios with unique UUIDs against one shared baseline snapshot; includes all preview results, additional comparative deltas and a deterministic baseline fingerprint. |
| `POST /api/optimization/goal` | Search at most 625 candidate strategies against one baseline, with a percentage profit target, explicit fixed behavioral assumptions and decision constraints. Returns up to three feasible strategies or an explained unavailable/unachievable result. |
| `GET /api/dashboard/summary` | Deprecated Phase 02 compatibility contract: completed merchandise revenue under its original tax-exclusive convention, without refund/customer-shipping adjustments. |
| `GET /api/products` | Product list with `limit` (1–100, default 50) and `offset` (minimum 0). |
| `GET /api/expenses` | Expense list with the same pagination and optional reporting dates. |

Finance/legacy summary endpoints and expenses accept `start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`; provide both or neither. The default is September 1–30, 2026. Both dates are inclusive in the store's timezone; timestamp queries use the equivalent start-inclusive/end-exclusive interval. Invalid ranges and extra query parameters return 422. Lists return objects containing `items`, `total`, `limit`, `offset`, `store_id` and `data_source`; expenses also include `reporting_period`. Expense entries identify whether they are included in operating expenses.

Money and percentages serialize as **decimal strings**, which React validates and formats for display. Unknown financial metrics serialize as `null` and display as **Unavailable** with a warning. `data_source.type` is `database_demo`.

The dashboard uses `/api/analytics/dashboard`, whose nested `summary` matches the existing finance endpoint for the same dates. The analytics endpoint accepts `preset=last_7_days`, `last_30_days` or `last_90_days`, or a pair of custom dates. Presets include the current day in the store timezone. Custom ranges allow at most 366 inclusive days. With no filters it uses the explicitly labeled sample period. Presets and explicit dates cannot be combined.

Six charts show daily revenue, orders, visitors/conversion, revenue versus operating expenses, product revenue and expense categories. Product and expense tables plus a collapsible daily table expose exact values. Missing traffic and monetary inputs stay unavailable; customer shipping and operating costs are not allocated to products. Changing a filter replaces all sections together, with loading, errors and retry support.

Open **Simulation Lab** in the sidebar. Load a historical date range, adjust selling prices, additional discount, conversion, visitors, unit costs, advertising or additional operating expense, then select **Run simulation**. Blank conversion preserves the exact historical ratio. Price changes apply before the additional discount. Order volume, net merchandise/COGS, carrier shipping and platform fees follow the documented aggregate model; fixed expenses stay fixed and advertising changes independently. Results show fractional expected orders, money, margins, differences and applied assumptions. Editing an input clears the previous result. Missing historical inputs or an absent sales/traffic baseline produce warnings and unavailable projections. No scenario is persisted and no historical records are changed.

Choose **A/B Arena** on that same page to add, duplicate, name, edit or remove up to four scenarios. **Compare scenarios** runs them against one freshly loaded financial snapshot. The comparison table and revenue/operating-profit chart preserve input order and show differences from baseline. Select a scenario manually or exclude it from consideration; no winner is automatically chosen. Editing scenarios invalidates the comparison, and **Reset comparison** restores two default drafts. This is a hypothetical strategy comparison, not a live A/B experiment. Drafts, selections and exclusions are kept only in the current browser view.

Choose **Goal Optimizer** to set a profit-increase target, price range, maximum discount, maximum additional advertising/operating spending and an optional operating-margin floor. Choose historical conversion or supply an explicit conversion assumption; visitor and unit-cost changes remain fixed for every candidate. **Find Strategies** evaluates a small deterministic grid and shows up to three feasible strategies with financial impact and constraint explanations. **Send to A/B Arena** opens the historical strategy and the selected recommendation as editable drafts. Results are best only among tested candidates under the specified assumptions; a fixed-demand model often favors the highest allowed price and lowest optional spending. An unreachable target is disclosed without inventing demand. Percentage targets require positive, complete historical operating profit.

The unchanged financial definitions apply: Sales recognize completed/partially refunded/refunded/returned orders; pending and cancelled orders are excluded. Refunds use their own event dates. Every price, discount, VAT rate and cost comes from transaction snapshots. Customer shipping is revenue, while carrier shipping is a cost. AdSpend alone supplies advertising totals. Operating profit is revenue minus COGS, non-advertising operating costs and ads; it is not accounting net profit. [The financial engine document](docs/phase-03-financial-engine.md) defines every field, rounding rule, null case and accounting assumption.

The following retained definitions describe the **legacy Phase 02 endpoint** only:

- **Revenue:** completed-order lines only, `sum(quantity × unit_price − discount_amount)`. Prices are tax-exclusive snapshots; `discount_amount` is the entire line's discount, rounded to cents. Product price changes do not rewrite historical revenue.
- **Orders:** count of completed orders; pending and cancelled orders contribute neither revenue nor order count.
- **Visitors:** sum of daily visitor records, not deduplicated people across the month. Sessions are stored separately.
- **Conversion:** completed orders / visitors × 100, rounded to two decimals using `ROUND_HALF_UP`; zero visitors yields zero conversion. The demo assumes at most one counted conversion per visit.
- **Operating expenses:** non-advertising `Expense` rows, including employee costs, rent, shipping, software and miscellaneous costs.
- **Advertising expenditure:** canonical `AdSpend` records. The advertising ledger mirror in `Expense` is excluded from aggregation to avoid double counting. `total_expenses = operating_expenses + advertising_expenditure`.

| September synthetic result | Value |
| --- | ---: |
| Revenue | USD 29,371.63 |
| COGS (finance API) | USD 10,906.00 |
| Gross profit (finance API) | USD 18,465.63 |
| Operating profit (finance API) | USD 10,182.18 |
| Operating margin (finance API) | 34.67% |
| Break-even orders (finance API) | 120 |
| Completed orders | 342 |
| Visitors | 11,635 |
| Conversion | 2.94% |
| Operating expenses | USD 6,507.45 |
| Advertising expenditure | USD 1,776.00 |
| Total expenses | USD 8,283.45 |

A valid empty financial reporting interval returns zero recorded monetary amounts; margins, AOV and break-even remain unavailable. Missing traffic dates produce a warning and null conversion. The legacy endpoint retains its previous all-zero empty contract. Missing database configuration, unavailable PostgreSQL or missing migrations return a clear 503 response without mock fallback; an unseeded demo returns 404. The frontend shows loading, error/retry and empty states. Check the connection and migrations when a healthy `/health` coexists with a dashboard error.

## AI Assistant configuration

Set `OPENAI_API_KEY` only in the backend environment (or ignored `backend/.env`) and restart the backend. `OPENAI_MODEL` defaults to `gpt-4.1-mini` and can be changed to a Responses-compatible model with function calling available to your API project. Never use a `VITE_` variable for credentials. The implementation uses the existing HTTP client and the [OpenAI Responses API function-calling contract](https://developers.openai.com/api/docs/guides/function-calling); the [default model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini) lists Responses and function-calling support.

Open **AI Assistant**, load the historical reporting period, and enter a complete goal such as: “Increase my operating profit by 20% without increasing advertising costs.” Each message is independent; repeat all constraints when refining a goal. If bounds are omitted, the disclosed exploration defaults are price changes from 0% to 10%, additional discount up to 10%, no extra advertising or operating spending, and unchanged conversion, visitors and unit costs. The applied optimizer request and limitations are visible with the result. Use **Send to A/B Arena** to compare a calculated recommendation against the historical strategy.

Without an API key, only the assistant returns an actionable configuration error; the existing dashboard and manual simulation/optimization workflows continue to work. The assistant never executes model-written SQL/code or displays model-authored financial figures. It sends the merchant message and aggregated synthetic store metrics to OpenAI with response storage disabled. No real-store access, record updates, durable chat memory or live experiment is implemented. Live OpenAI access has not been verified in this workspace because no key was supplied.

## Verification

Phase 08 preserves existing regression tests and adds controlled tool execution, invalid model output, provider failure, missing credentials and assistant-to-Arena coverage. Exact executed results are recorded in [the Phase 08 report](docs/phase-08-report.md). No schema migration or dependency change is needed. Local verification uses PostgreSQL 16.2 on macOS Apple Silicon; live Supabase and Windows execution remain unverified.

Unit tests run without database credentials; PostgreSQL integration tests explicitly skip when `TEST_DATABASE_URL` is absent.

macOS:

```sh
cd backend
../.venv/bin/python -m pytest
cd ..
```

Windows PowerShell:

```powershell
Push-Location backend
..\.venv\Scripts\python.exe -m pytest
Pop-Location
```

Frontend checks on both platforms:

```sh
npm test
npm run build
```

### Local PostgreSQL integration tests

Use a running local server and a dedicated local role with `CREATEDB`. The examples below use placeholders: replace `YOUR_LOCAL_ROLE` and `ENCODED_PASSWORD` with your local credentials. The `createdb -W` command prompts for the password. From either OS, create an administrative entry database:

```sh
createdb -h 127.0.0.1 -p 5432 -U YOUR_LOCAL_ROLE -W rdl_test_admin
```

Set the test URL in a terminal, then run pytest as above:

```sh
# macOS
export TEST_DATABASE_URL='postgresql://YOUR_LOCAL_ROLE:ENCODED_PASSWORD@127.0.0.1:5432/rdl_test_admin?sslmode=disable'
```

```powershell
# Windows PowerShell
$env:TEST_DATABASE_URL = 'postgresql://YOUR_LOCAL_ROLE:ENCODED_PASSWORD@127.0.0.1:5432/rdl_test_admin?sslmode=disable'
```

Tests accept only an explicit local `rdl_test_*` database URL and reject query parameters that could redirect the connection. They create a fresh UUID-named database, apply migrations, test constraints/relationships, Decimal precision, seed idempotency, scoped APIs and aggregation, then drop only that generated database. The input administrative database is never migrated, seeded or dropped. Tests never fall back to `DATABASE_URL`; shared Supabase databases are not integration-test targets.

### Browser integration tests

Use a **separate** local browser-test database. Playwright requires it to be migrated and seeded beforehand; it does not use the pytest administrative database. Create it once:

```sh
createdb -h 127.0.0.1 -p 5432 -U YOUR_LOCAL_ROLE -W rdl_test_browser
```

In a dedicated macOS test terminal, from the repository root:

```sh
export TEST_DATABASE_URL='postgresql://YOUR_LOCAL_ROLE:ENCODED_PASSWORD@127.0.0.1:5432/rdl_test_browser?sslmode=disable'
export DATABASE_URL="$TEST_DATABASE_URL"
export MIGRATION_DATABASE_URL="$TEST_DATABASE_URL"
export RDL_DB_POOL_MODE=direct
export RDL_DB_SSLMODE=disable
.venv/bin/python -m alembic -c backend/alembic.ini upgrade head
cd backend
../.venv/bin/python -m app.seed
cd ..
npm run build
npx playwright install --no-shell chromium
npm run test:e2e
```

In a dedicated Windows PowerShell test terminal:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://YOUR_LOCAL_ROLE:ENCODED_PASSWORD@127.0.0.1:5432/rdl_test_browser?sslmode=disable'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
$env:MIGRATION_DATABASE_URL = $env:TEST_DATABASE_URL
$env:RDL_DB_POOL_MODE = 'direct'
$env:RDL_DB_SSLMODE = 'disable'
.\.venv\Scripts\python.exe -m alembic -c backend\alembic.ini upgrade head
Push-Location backend
..\.venv\Scripts\python.exe -m app.seed
Pop-Location
npm run build
npx playwright install --no-shell chromium
npm run test:e2e
```

Playwright validates the local `rdl_test_*` destination, starts FastAPI with that URL and starts the production preview. Stop existing servers on ports 8000 and 4173 first. Successful browser requests reach the real API/database; failure cases are intercepted deliberately. Close the dedicated terminal afterward so its temporary database settings do not affect normal development.

The GitHub Actions matrix configures PostgreSQL 17 with `ankane/setup-postgres@v1` on macOS and Windows, then runs backend, frontend and browser checks. A workflow being present does not establish that a hosted run passed. See [the Phase 08 report](docs/phase-08-report.md) for actual results and outstanding live-host verification. Tests replace the OpenAI transport and never require a paid API key; browser test servers explicitly disable that key.

## Provenance and hackathon use

The workspace was empty when Phase 01 began. Its project source was created during that task; dependencies are third-party packages, and the button follows the shadcn/ui composition pattern. Phases 02–08 extend that foundation while preserving the existing frontend design. This history does not establish event eligibility; record the actual event development window and follow the event's rules.

The [Phase 01](docs/phase-01-report.md), [Phase 02](docs/phase-02-report.md), [Phase 03](docs/phase-03-report.md), [Phase 04](docs/phase-04-report.md), [Phase 05](docs/phase-05-report.md), [Phase 06](docs/phase-06-report.md) and [Phase 07](docs/phase-07-report.md) reports remain as historical verification. The current implementation stops at Phase 08.
