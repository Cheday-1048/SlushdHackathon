# UI integration (Hackathon-UI-Starter templates)

The interface is being rebuilt on the design system and templates of the separate `Hackathon-UI-Starter` project. The starter's folders are never edited; code is copied into this repository and adapted to real API data.

## Structure

| Path | Purpose |
| --- | --- |
| `src/design-system/` | Tokens (colors, radius, shadow, motion), accent/density/motion presets, theme provider, background styles. Copied from the starter; re-skin here only. |
| `src/shared/components/ui/` | Primitives: button, card, badge, dialog, tooltip, input, native select. |
| `src/shared/components/layout/` | Animated background, appearance controls. |
| `src/components/layout/` | App shell, sidebar, top bar. |
| `src/components/dashboard/` | Dashboard widgets fed by `/api/analytics/dashboard`. |

The `@/` alias points to `src/` (tsconfig, Vite and Vitest). Template code that imports `@/shared` and `@/design-system` can be copied in without path changes.

## Template mapping

| Template | App counterpart | Status |
| --- | --- | --- |
| 06-dashboard | `/dashboard` | **Integrated.** Shell, KPI cards, performance chart, report details, loading/error/empty/incomplete states. |
| 07-analytics | "Business analytics" section (`/dashboard#analytics`) | Next. Currently the existing section, themed with the shared tokens. |
| 03-settings | none (no account or preferences API) | Only the Appearance part is real (theme, accent, density, motion; stored in the browser). Available from the top bar. A full settings page is not planned until a backend exists. |
| 01-landing | none | Not integrated. The app has no marketing site. |
| 02-onboarding | none (no authentication backend) | Not integrated. |
| 04-compact | none | The starter ships this template as an unimplemented placeholder. |
| 05-ai-interface | AI Assistant (`/ai-assistant`, Phase 08) | The assistant backend exists and its existing page now uses the shared shell and tokens; the template layout itself is not adopted. |
| 08-project-management | none | Not integrated. No backend. |
| 09-workspace | none | Not integrated. No backend. |

Simulation Lab, A/B Arena, Goal Optimizer and the AI assistant (phases 05-08) are implemented in the backend and reachable from the sidebar (`/simulation-lab`, `/ai-assistant`). Real-traffic A/B Testing has no backend, so it stays in the sidebar as a disabled "Planned" entry.

## Dashboard data rules

- KPI values come from `summary`; the performance chart and sparklines read the matching `daily` series. Nothing is recalculated in the browser.
- Unknown values (`null`) show as "Unavailable" and appear as gaps in charts, never as zero.
- Operating margin has no daily series in the API, so its card shows the period figure only and is not selectable for the chart.
- No trend or period-over-period badges are shown because the API does not provide a previous period.

## Demo Mode (`VITE_DEMO_MODE=true`)

Runs the app on bundled sample data with no backend or database, for presentations and for the public demo.

- **Data:** `src/demo/nova-commerce.json` is the backend's own synthetic September 2026 store ("Nova Commerce"), exported by running the real seed and finance engine as additive per-day components. `src/demo/aggregate.ts` rebuilds any reporting period from them with the backend's rounding rules (exact cents, ROUND_HALF_UP) and validates the result with the existing Zod contract.
- **Proof:** `src/demo/reference-ranges.fixture.json` holds real analytics-service responses for nine periods; `aggregate.test.ts` requires an exact match. The sample period reproduces the README results (revenue 29,371.63, operating profit 10,182.18, 342 orders).
- **Separation:** `src/api/client.ts` switches the data source at call time; the hook skips the health check and reports a `demo` connection, so the UI never says "API connected". Real mode is unchanged.
- **Presets** end on the dataset's last day (2026-09-30), because the data stops there.
- **Not available in Demo Mode:** Simulation Lab and the AI assistant call backend services; their routes explain this.
- **Guide:** steps 1-2 of the business scenario use the same demo data; steps 4-6 use output of the real Simulation, A/B Arena and Goal Optimizer engines on it (`src/demo/engine-examples.json`).

`vercel.json` sets `VITE_DEMO_MODE=true` for the Vercel build. Remove that entry and set `VITE_API_BASE_URL` to deploy against a real backend.

## Vercel deployment

The Vercel project builds the Vite frontend (`vercel.json`: `npm run build`, output `dist`, SPA rewrite, Demo Mode). The repository also contains the FastAPI backend, and Vercel's multi-service detection would otherwise report two services (Vite and FastAPI) and reject the top-level `buildCommand`/`outputDirectory`/`framework` settings ("owning service is ambiguous"). `.vercelignore` excludes `backend/`, `scripts/`, `tests/`, `docs/` and `.github/` from the deployment so the project stays a plain Vite app. The backend needs its own host (for example Render) with a PostgreSQL database; point the frontend at it with `VITE_API_BASE_URL` and turn Demo Mode off.
