# CopilotKit <> Angular + AnalogJS Starter

This is a starter for building AI agents with [CopilotKit](https://copilotkit.ai) on an **Angular + [AnalogJS](https://analogjs.org)** fullstack app, using **OpenRouter** as the model provider. The Copilot Runtime and the agent both run in-process inside Analog's Nitro server — no separate runtime process, no Python.

## Architecture

One process, started by `npm run dev` (Vite):

| Piece            | Where it lives                                    | What it is                                                              |
| ---------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Angular UI       | `src/app/`, served by Vite (default port `5173`)  | The SPA (signals, zoneless, CopilotKit Angular components)              |
| Copilot Runtime  | `src/server/copilotkit-runtime.ts` (Nitro)        | Mounted at `/api/copilotkit` via the server routes                      |
| Agent            | same file — `BuiltInAgent`                        | In-process TypeScript agent calling OpenRouter (via the Vercel AI SDK)  |

The Angular app talks to the runtime same-origin at `/api/copilotkit`. The runtime runs the `default` agent (a `BuiltInAgent`) directly. The trip itself is **client-owned** in an NgRx Signal Store; the agent edits it exclusively through granular, zod-validated frontend tools forwarded over AG-UI — there is no full-state snapshot channel for a weak model to corrupt.

Each **conversation owns its trip**: boards persist per thread id, so "+ New Conversation" starts an empty road and returning to a conversation brings its itinerary back.

### How much of this is deterministic

Free models narrate actions they never took, so state changes are pushed as far away from model whim as the design allows:

| Layer | Determinism |
| --- | --- |
| Intent routing (`server/intent.ts`) | One temperature-0 classification per user turn picks the intended tool path; failure degrades to plain chat |
| Deleting a day / clearing the trip | **No model involvement** — the server authors the whole run (text + `clear_trip` tool call) once plain code resolves the target from the message ("día 2", a day's label, "borra todo el viaje") |
| Every other edit | Model-driven but steered: exact tool sequence injected as routing guidance, arguments validated by zod, bad ids answered with `ok: false` and a corrective message |
| Applying an approved deletion | Store methods only — the human's click is the trigger |

The prompt also forbids claiming a change without a successful tool call, and `temperature: 0.2` narrows the sampling variance behind phantom actions.

## Prerequisites

- Node.js 22+
- An [OpenRouter API key](https://openrouter.ai/settings/keys)

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure your environment. Copy `.env.example` to `.env` and set your OpenRouter key:

   ```bash
   cp .env.example .env
   # then edit .env and set OPENROUTER_API_KEY=sk-or-...
   ```

   The default model is `openrouter/free` — OpenRouter's router across the whole free pool, which dodges per-model rate limits and filters for tool support (response quality varies turn to turn). Pin a specific model via `OPENROUTER_MODEL` in `.env` (e.g. `minimax/minimax-m3:free` for consistent behavior); paid models need OpenRouter credits.

3. Start the dev server:

   ```bash
   npm run dev
   ```

   Then open http://localhost:5173 (Vite picks the next port if 5173 is busy — check the terminal output).

## Available Scripts

- `dev` — the Vite dev server (UI + Nitro API routes; env problems are warned at server startup)
- `dev:debug` — same as `dev` with `LOG_LEVEL=debug`
- `build` — production build (client → `dist/client`, Nitro server → `dist/analog`)
- `preview` — serve the production build locally

(There is no test script yet — see *Using AnalogJS* below.)

## What's in here

The demo app is **Sacbé**, a trip planner (named for the Maya white roads) where the human and the agent co-edit an itinerary:

- `src/app/app.ts` — the three-column shell (threads drawer / planner / chat), the `setThemeColor` frontend tool, and the thread lifecycle: `?thread=` URL sync, verified restore, and reset-on-delete.
- `src/app/app.config.ts` — `provideCopilotKit` wiring: runtime URL, generative-UI renderers, the `clear_trip` human-in-the-loop tool, and static + AI-generated suggestions.
- `src/app/trip/domain/` — pure model: `trip.models.ts` (types) and `trip.factory.ts` (kebab-case id generation).
- `src/app/trip/application/` — the NgRx Signal Store: `trip.store.ts` composes `with-trip.ts` (state, computed signals, deterministic methods, localStorage persistence) and `with-copilot.ts` (agent context + the frontend tools `set_trip_name` / `upsert_day` / `upsert_stop` / `remove_stop` / `select_day` — deliberately no day-removal tool; that path is `clear_trip` HITL only).
- `src/app/trip/ui/` — presentation-only components: the sacbé-road board, masthead, stop-detail overlay (Wikipedia + Maps/menu/photo link-outs), per-stop weather hints, and the chat cards (real Open-Meteo forecast, search sources, clear-trip approval).
- `src/app/services/` — cross-cutting data access: `DayWeatherService` (hourly Open-Meteo) and `PlaceInfoService` (Wikipedia lookups with a relevance gate).
- `src/app/i18n.ts` — runtime es/en translations loaded before bootstrap; the masthead toggle persists the choice and re-joins the active thread across the switch.
- `src/server/copilotkit-runtime.ts` — composition root: the Copilot Runtime (env-gated managed Intelligence) + the shared h3 handler. Assembled from `env-checks.ts` (startup warnings), `model.ts` (OpenRouter provider), `prompt.ts`, `tools/weather.ts` (Open-Meteo), `tools/search.ts` (Tavily, scoped), `resilience.ts` (travel-themed, bilingual recovery when the model stream dies), `intent.ts` (per-turn routing + deterministic clear-target resolution), and `agent.ts` (the `BuiltInAgent` plus the routing middleware).
- `src/server/routes/api/copilotkit/` — Nitro routes (`index.ts` + catch-all) delegating to the shared runtime handler.
- `vite.config.ts` — the Analog plugin (`ssr: false`; the CopilotKit components are client-rendered).
- The CopilotKit Inspector is mounted automatically in development builds; production builds never mount it.

## Threads & managed Intelligence (optional)

The threads drawer and persistent conversation memory are powered by **CopilotKit Intelligence**, enabled when `COPILOTKIT_LICENSE_TOKEN` (plus `INTELLIGENCE_API_KEY` and the endpoint vars) are set in `.env` — `copilotkit init` provisions these. Without them, the runtime falls back to an in-memory runner and the drawer stays locked.

> **Before any multi-user deployment:** `src/server/copilotkit-runtime.ts` ships a demo `identifyUser` stub returning `sacbe-user` (override via `COPILOTKIT_USER_ID`). CopilotKit Intelligence requires the identified user to actually exist, so replace the stub with your real auth-derived identity — leaving it in place makes thread operations fail (you'll see `THREAD_NOT_FOUND ... userId=sacbe-user` in the logs) and would share one thread history across all users.

To switch the connected Intelligence project, run `copilotkit project select` from this directory (recorded in `.copilotkit/project.json`).

### Deleted threads are permanently unusable

When the platform deletes a thread it keeps the row: the id then returns `404` on read *and* `409 DATABASE_CONSTRAINT_VIOLATION` on re-create, so a client that remembers it can never run again in that conversation. The app defends against this in three places:

- The chat session always starts on a **freshly minted** thread id. A remembered conversation (deep link or language-switch stash) is activated only after it is confirmed present in the loaded thread list — a deleted thread never appears there, so it can never be re-entered.
- The drawer's `delete` event is handled directly, resetting the chat and dropping that conversation's stored board even when the platform-side delete fails.
- An active thread that disappears from the list (deleted in another tab) resets to a fresh conversation.

## Using AnalogJS

What this app uses, and what it deliberately doesn't:

- **Nitro server routes** (`src/server/routes/`) — yes, this is the whole point: the Copilot Runtime, the agent, and the API keys live in the same process as the UI.
- **Vite dev server + build** — yes; `npm run dev` is a single process, and `vite build` emits both the client bundle and a deployable Nitro server (`dist/analog`).
- **SSR / prerendering** — deliberately off (`ssr: false`). The CopilotKit chat components are not SSR-safe, and the app is behind an interaction anyway.
- **File-based routing** (`@analogjs/router`) — not used. The app is a single view; the active conversation is carried in `?thread=` instead of a route. Promoting that to `/thread/:id` is the natural first step if more pages appear.
- **Vitest integration** — **not set up yet, and the clearest gap.** Analog ships a first-class Vitest configuration, and the logic that most deserves tests is already pure and isolated: `resolveClearTarget`, the intent classifier's parsing, `trip.factory`'s id generation, and the store's `withTrip` methods.

## 📚 Documentation

- [CopilotKit Documentation](https://docs.copilotkit.ai)
- [AnalogJS Documentation](https://analogjs.org)
- [Angular Documentation](https://angular.dev)
- [OpenRouter Models](https://openrouter.ai/models) (filter by tools support; `:free` suffix = free tier)

## License

This project is licensed under the MIT License — see the LICENSE file for details.
