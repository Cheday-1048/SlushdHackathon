# Phase 01 completion report

## Delivered

- FastAPI modular monolith with separate configuration, routes, schemas, service and mock-provider layers.
- `GET /health` and `GET /api/dashboard/summary`, structured Pydantic contracts, consistent sample metrics and explicit mock-data metadata.
- React/Vite dashboard with sidebar routing, reusable KPI cards, environment-based typed API client and runtime response validation.
- Actual API health status; loading, timeout and error states; refresh/retry; cancellation of obsolete requests. Business figures exist only in the backend provider.
- Restricted CORS, generic server errors, exact dependency locks, environment examples, Git ignores and normalized line endings.
- Windows PowerShell/macOS setup instructions and a Windows/macOS GitHub Actions verification matrix.

## Files created

There were no existing project files to modify. All source below is new; dependency packages are third-party code.

| Area | Files |
| --- | --- |
| Repository/configuration | `.gitignore`, `.gitattributes`, `.nvmrc`, `.python-version`, `.env.example`, `package.json`, `package-lock.json`, `components.json`, `index.html`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts` |
| Frontend | `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/api/client.ts`, `src/api/schemas.ts`, `src/hooks/use-dashboard.ts`, `src/pages/dashboard.tsx`, `src/components/layout.tsx`, `src/components/kpi-card.tsx`, `src/components/ui/button.tsx`, `src/lib/utils.ts` |
| Backend | `backend/app/main.py`, `backend/app/core/config.py`, `backend/app/api/health.py`, `backend/app/api/dashboard.py`, `backend/app/schemas/common.py`, `backend/app/schemas/dashboard.py`, `backend/app/services/dashboard.py`, `backend/app/providers/mock_dashboard.py`, package `__init__.py` files |
| Backend setup/tests | `backend/.env.example`, `backend/requirements.in`, `backend/requirements.txt`, `backend/pytest.ini`, `backend/tests/test_api.py` |
| Frontend/browser tests | `src/test/setup.ts`, `src/api/client.test.ts`, `tests/e2e/dashboard.spec.ts` |
| Tooling/documentation | `scripts/start-backend.mjs`, `.github/workflows/verify.yml`, `README.md`, `docs/phase-01-report.md` |

Generated `.venv`, `node_modules`, `dist`, test output and browser screenshots are ignored. The project has its own local Git repository, avoiding the unrelated parent Desktop repository. No commit, remote push or deployment was performed.

## Verification

Executed locally on **macOS arm64**, Node **24.19.0**, Python **3.12.14**:

| Check | Result |
| --- | --- |
| Clean Node installation (`npm ci`) | Passed; npm reported 0 vulnerabilities |
| Python installation from locked requirements / `pip check` | Passed; no broken requirements |
| Backend (`python -m pytest`, in `backend`) | 22 tests passed |
| Frontend API client (`npm test`) | 5 tests passed |
| TypeScript + frontend production build (`npm run build`) | Passed |
| Production browser integration (`npm run test:e2e`) | 6 Chromium tests passed, including real FastAPI rendering and retry recovery |

Backend coverage includes health, schema validation, conversion consistency, zero visitors, invalid values/dates, CORS acceptance/rejection and generic 500 responses. Frontend tests include malformed JSON, invalid schemas, HTTP/server errors and timeouts. Browser tests check real backend values, loading, refresh, retry recovery, separate endpoint failures, routes, planned sections and narrow screens.

Uvicorn was also started explicitly; `/health`, `/api/dashboard/summary` and the Vite dev server returned HTTP 200. Desktop/mobile screenshots were captured for layout review. Temporary preview/test servers were stopped after verification. The full installed Chromium browser was used (`channel: chromium`); the additional headless-shell download was not needed and was stopped.

## Limits and scope

- Windows checks are configured in CI but **have not run** in this session. No remote CI results are claimed.
- A nonblocking third-party Starlette/AnyIO deprecation warning appears in pytest; all backend tests pass.
- All business metrics are mock values; no merchant/store is connected. No authentication or database exists yet.
- Hackathon rules/development-window eligibility were not verified because no event rules were supplied. The README records the empty-workspace provenance.
- No Phase 02 work, financial engine, AI integrations, simulations, strategy optimization or A/B experiment functionality was implemented.

## Run

After the platform-specific setup in the [README](../README.md), use two terminals in the project root:

```sh
npm run backend -- --reload
```

```sh
npm run dev
```

Open `http://127.0.0.1:5173`; API docs are at `http://127.0.0.1:8000/docs`. The launcher discovers `.venv` on Windows and macOS. Configuration is optional for the documented defaults; use the `.env.example` files when changing URLs/origins.
