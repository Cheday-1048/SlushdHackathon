# Phase 08 deployment preparation

Target source: `codex/phase08-integration` in `Cheday-1048/SlushdHackathon`. The separate design-system work on `main` is preserved. This document describes preparation; it does **not** establish a successful deployment or a live URL.

## Which Vercel configuration is used where

`main` ships a frontend-only `vercel.json` (Vite, Demo Mode, with `backend/` excluded through `.vercelignore`) so the public demo needs no database. The full-stack variant described below, with the FastAPI backend as a second Vercel service, is kept as `docs/vercel.fullstack.example.json` and `docs/vercelignore.fullstack.example`. To deploy it, copy them over `vercel.json` and `.vercelignore` in a separate project and configure the database variables listed here.

## Hosting layout

The root `vercel.json` defines Vite and FastAPI services in one Vercel project. `/api/*`, `/health`, `/docs`, `/redoc` and `/openapi.json` route to FastAPI; browser navigation routes to the Vite SPA. This follows the current [Services configuration](https://vercel.com/docs/services/config-reference) and [routing contract](https://vercel.com/docs/services/routing). Services is currently a beta capability; the actual provider build must succeed before this configuration is considered deployed.

Node uses the existing `24.x` requirement. `backend/.python-version` requests the supported Python 3.12 runtime at the backend service root. The backend's existing dependency file and `app.main:app` entrypoint are retained. The function limit is 60 seconds to accommodate the existing assistant request budget.

Production browser builds default to their own origin when `VITE_API_BASE_URL` is absent. Development retains `http://127.0.0.1:8000`. A separately hosted backend can still be selected with an explicit absolute HTTPS `VITE_API_BASE_URL`. Do not set this variable to localhost in Vercel.

`.vercelignore` excludes local credentials, PostgreSQL data/runtime, virtual environments, dependency directories, build/test outputs and private-key files. Financial engines, migrations, and seed behavior are unchanged.

## Required account and database setup

1. Use an authorized Vercel account and import the GitHub repository with `codex/phase08-integration` as this project's deployment branch. Use a separate project from any existing `main` deployment. Root directory is the repository root; `vercel.json` owns the service build settings.
2. Select or create an authorized Supabase PostgreSQL project for the synthetic demo. Keep the private `retail` schema out of Supabase's exposed API schemas.
3. Store database credentials as backend environment values. Use the connection details supplied by Supabase rather than constructing a password or host. Do not put credentials in browser variables, source control or chat.
4. Apply the existing migrations and additive demo seed once using the direct/session migration connection. Do not run migrations or seed during function requests.
5. Deploy, wait for successful provider status, then run the smoke checks below against the returned URL.

Environment values:

| Setting | Value |
| --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL URL; TLS required |
| `MIGRATION_DATABASE_URL` | Direct/session connection for migrations when the runtime URL uses transaction pooling |
| `RDL_DB_POOL_MODE` | `transaction` for a Supabase transaction-pooler URL; otherwise use the selected supported connection mode |
| `RDL_DB_SSLMODE` | `require` or configured certificate verification |
| `RDL_CORS_ORIGINS` | JSON array containing the exact public origin if cross-origin browser access is needed; same-origin service routing does not require CORS |
| `OPENAI_API_KEY` | Optional backend secret to enable live AI; absent key keeps the assistant gracefully unavailable |
| `OPENAI_MODEL` | `gpt-4.1-mini`, or another supported Responses/function-calling model available to the account |
| `VITE_API_BASE_URL` | Omit for same-origin deployment; explicit HTTPS backend origin only for split hosting |

For the initial database setup, inject the authorized migration URL as `DATABASE_URL` in the one-off process and leave `RDL_DB_POOL_MODE=session`. Then run from the repository root:

```sh
.venv/bin/python -m alembic -c backend/alembic.ini upgrade head
PYTHONPATH=backend .venv/bin/python -m app.seed
```

These commands require an existing configured virtual environment. The seed creates only the existing synthetic demo and preserves other store records. Do not use test-database reset or test fixtures against a hosted database.

## Live verification checklist

- `/health` returns 200. This checks the API process only.
- `/api/finance/summary` returns 200 with the seeded September revenue `29371.63` and operating profit `10182.18`.
- `/api/analytics/dashboard` returns 200 and the dashboard renders its records.
- `/dashboard`, `/simulation-lab` and `/ai-assistant` open directly and survive browser refresh.
- A manual goal optimization returns calculated strategies and an Arena comparison reproduces their parameters/results.
- Without an OpenAI key, the assistant gives `assistant_not_configured` while manual optimization works. With a key, verify a live Responses tool workflow separately.

At preparation time no Vercel/Supabase account connection, live database URL or OpenAI key had been confirmed. Local checks do not replace provider build, database setup or live endpoint verification. No live URL is reported until those checks succeed.

## Local verification

- `npm test`: 80 tests passed across 18 files, including production/development API origin selection and explicit URL overrides.
- `VITE_API_BASE_URL='' npm run build`: TypeScript and Vite production build passed. The existing large-chunk warning remains.
- `git diff --check`: passed.

Provider build, hosted database migrations/seed, and live smoke checks remain pending account access.
