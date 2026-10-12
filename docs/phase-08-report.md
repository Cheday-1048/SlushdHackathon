# Phase 08 — Minimal AI Decision Assistant

The assistant turns a natural-language merchant goal into controlled calls to the existing FinanceService and GoalOptimizationService. Simulation Lab now has an **AI Assistant** mode, also reachable from the sidebar at `/ai-assistant`. It displays historical metrics, calculated hypothetical strategies, applied constraints and limitations. A recommended strategy can be transferred to the existing A/B Arena for comparison.

## Calculation integrity and scope

OpenAI interprets goals and selects tools; it does not calculate financial results. The backend accepts only `get_store_metrics` and `run_goal_optimization`, validates every argument with Pydantic, and requires the exact reporting dates selected in the browser. Metrics must be retrieved before optimization. The configured demo organization/store IDs and both demo flags continue to restrict database access. There is no store selector, SQL tool, code execution, write tool or real-store connection.

The finance, simulation, optimization and comparison services remain unchanged. The optimizer still searches its bounded deterministic grid using the existing simulation engine. Model-written final prose is discarded. The visible answer is a backend-authored explanation of validated service results; amounts, targets and recommendations are not taken from generated text. The optimizer's authoritative baseline supplies both historical and strategy panels.

This minimal implementation supports percentage increases in operating profit, historical metrics and a static clarification response. Each request is independent; previous messages are not retained or sent as conversational context. Unsupported goals or constraints must not be silently converted to another objective. The model is instructed accordingly, but natural-language interpretation still needs review in the displayed applied request. No live language-quality evaluation was possible without an API key.

Unspecified constraints use disclosed exploration defaults: price changes from 0% to 10%, additional discounts from 0% to 10%, no additional advertising or operating spending, historical conversion, unchanged visitors and unit costs, and no margin floor. Users can supply supported alternatives in their message. Defaults are planning assumptions; they are not inferred customer behavior. The optimizer's price-demand, grid-search and incomplete-baseline limitations remain visible.

## Responses API and configuration

The existing `httpx` dependency calls `https://api.openai.com/v1/responses`. `OPENAI_API_KEY` is backend-only and represented by `SecretStr`; `OPENAI_MODEL` defaults to `gpt-4.1-mini`. The default model's [official documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini) lists Responses and function-calling support. Account-specific access was not verified.

Tool definitions follow the [official function-calling contract](https://developers.openai.com/api/docs/guides/function-calling): strict object schemas, all fields required, no additional properties, serial tool calls and decimal strings. Local Pydantic validation independently enforces existing financial limits. Model-supplied search settings are rejected, so the existing default grid and maximum candidate cap remain controlled by the backend.

Requests set `store: false`. The merchant message and aggregate demo metrics are sent to OpenAI; credentials, individual orders and customer records are not included in tool output. Reasoning items with encrypted content are retained for stateless continuation when a configured model returns them, following the [Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create). Such items and arbitrary generated prose are never displayed in financial results.

Controls:

| Control | Limit / behavior |
| --- | --- |
| User message | Trimmed string, 1–2,000 characters |
| Reporting period | Existing inclusive, ordered period; at most 366 days |
| Provider rounds / successful tools | At most 3 rounds and 2 distinct tools; at most one optimization |
| Provider output / tool arguments | 128,000 bytes / 16,000 bytes; output token cap 1,600 |
| Network request deadline | Default 15 seconds; `RDL_ASSISTANT_REQUEST_TIMEOUT_SECONDS` |
| Overall workflow deadline | Default 45 seconds; `RDL_ASSISTANT_TOTAL_TIMEOUT_SECONDS` |
| Database timeout | Existing per-statement timeout, default 5 seconds |
| Browser timeout | Assistant 55 seconds; existing endpoints retain 8 seconds |
| Missing credentials | Sanitized 503 before opening a database session |
| Provider or invalid-tool failure | Sanitized 502, with no provider body or credentials |
| Timeout | Sanitized 504 |

The synchronous route runs in FastAPI's worker pool. Network operations use an async deadline inside that worker; synchronous database work is checked before and after execution and retains its statement timeout. The overall deadline is therefore not a hard cancellation of an in-progress SQL operation. This avoids closing a session while another worker is still using it. Database errors retain existing 503 behavior and missing demo stores retain 404 behavior.

Set `OPENAI_API_KEY` in the backend environment or ignored `backend/.env`, optionally set `OPENAI_MODEL`, and restart the backend. The example configuration contains no credential. The dashboard and manual optimizer remain usable without a key.

## Verified example and frontend behavior

The [saved assistant example](phase-08-assistant-example.json) uses prescribed OpenAI tool responses through HTTP MockTransport and real local PostgreSQL calculations. It is explicitly labeled as a provider stub, not a live OpenAI response.

For “Increase my operating profit by 20% without increasing advertising costs,” the unchanged September demo data and disclosed defaults produce:

| Result | Value |
| --- | ---: |
| Historical operating profit | 10,182.18 USD |
| Calculated target, rounded upward to cents | 12,218.62 USD |
| Evaluated / feasible candidates | 15 / 2 |
| Recommended profit at +10% price, no additional discount/spend | 13,119.34 USD |
| Recommended profit at +7.5% price, no additional discount/spend | 12,385.05 USD |

Those outcomes hold conversion and traffic fixed. They do not establish that customers will accept a price increase without changing demand. Arena recalculation with the same historical data reproduces the exact strategy parameters and calculated outcomes.

The frontend reuses existing components and money formatting. It preserves the message on errors, validates responses, aborts requests when inputs or periods change, rejects mismatched response periods, and prevents stale results from being transferred. It shows the applied target, limits, behavioral assumptions, historical metrics and hypothetical recommendations. Changing modes clears transient assistant results; no chat or scenario records are saved. Desktop and 375px mobile screenshots were reviewed and the browser check found no horizontal page overflow.

## Verification

Verification used Node 24.19.0, Python 3.12.14 and PostgreSQL 16.2 on macOS Apple Silicon. No live OpenAI request was made.

| Check | Result |
| --- | --- |
| Backend regression suite | **530 passed**, no skips or failures, 18.33 seconds |
| Assistant-specific backend cases | **65 passed**, including real database/optimizer integration |
| Full frontend unit suite | **76 passed**, including 10 assistant cases |
| TypeScript and Vite production build | **Passed** |
| Chromium against production build and real local backend | **32 passed**, including 2 assistant workflows |

Backend cases cover malformed and unauthorized inputs, nonfinite/numeric financial arguments, foreign periods/store selectors, search injection, strict provider tool schemas, unknown/repeated tools, bounded responses, fabricated model prose, provider failure/timeouts, missing credentials before database access, reasoning continuation, actual optimizer equality and read-only repeatable-read transactions. Record fingerprints remain unchanged. The browser verifies actual missing-key fallback and real manual optimization; its success test stubs only the assistant envelope while calculating and comparing strategies through the real backend. Live natural-language interpretation and provider/account access remain unverified.

Commands:

```sh
TEST_DATABASE_URL='<local isolated rdl_test_* URL>' .venv/bin/python -m pytest -c backend/pytest.ini backend/tests
npm test
npm run build
TEST_DATABASE_URL='<dedicated seeded local browser URL>' npm run test:e2e
```

Existing nonblocking warnings remain: Starlette/AnyIO deprecation, Playwright color settings, and Vite's approximately 917 kB uncompressed JavaScript bundle warning. No dependency, migration or new financial formula was introduced. Live Supabase, hosted CI and Windows execution remain unverified.

Verification-owned HTTP servers and local PostgreSQL were stopped after the checks; persisted local database files remain intact.

## Preservation and file inventory

Before implementation, 146 source files were archived locally in ignored `.local/phase07-before-phase08.tar.gz`, with hashes in `.local/phase08-start-files.json`. Existing uncommitted work was preserved. Hash comparisons confirm that 24 protected calculation, database, migration, seed and dependency files are unchanged. No source file was removed. No commit, push, deployment or hackathon submission was performed or verified in this phase.

Created:

- `backend/app/api/assistant.py`
- `backend/app/schemas/assistant.py`
- `backend/app/services/assistant.py`
- `backend/tests/test_assistant.py`
- `backend/tests/test_assistant_database.py`
- `src/api/assistant.ts`
- `src/api/assistant.test.ts`
- `src/components/decision-assistant.tsx`
- `src/components/decision-assistant.test.tsx`
- `tests/e2e/assistant.spec.ts`
- `docs/phase-08-assistant-example.json`
- `docs/phase-08-report.md`

Modified:

- Backend `.env.example`, `core/config.py` and `main.py`: configuration, route/error registration and API version 0.8.0.
- Frontend `client.ts`, `App.tsx`, `layout.tsx`, `simulation-lab.tsx` and `index.css`: assistant request, mode/navigation and minimal styling.
- `playwright.config.ts` and `tests/e2e/dashboard.spec.ts`: disable paid API access in tests and update the enabled navigation assertion.
- `README.md`, `docs/api.md`, `docs/openapi.json` and `.github/workflows/verify.yml`: configuration, contract and verification documentation.

The implementation stops at Phase 08. It does not add Monte Carlo, model training, real-world A/B testing, persistence or Phase 09 features.
