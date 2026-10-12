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
| 05-ai-interface | "AI Assistant" (planned, disabled) | Not integrated. No backend. |
| 08-project-management | none | Not integrated. No backend. |
| 09-workspace | none | Not integrated. No backend. |

Modules without a backend (Simulation Lab, AI Assistant, A/B Testing) stay in the sidebar as disabled "Planned" entries and are not presented as working features.

## Dashboard data rules

- KPI values come from `summary`; the performance chart and sparklines read the matching `daily` series. Nothing is recalculated in the browser.
- Unknown values (`null`) show as "Unavailable" and appear as gaps in charts, never as zero.
- Operating margin has no daily series in the API, so its card shows the period figure only and is not selectable for the chart.
- No trend or period-over-period badges are shown because the API does not provide a previous period.
