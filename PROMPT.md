# Replay prompt

A from-scratch prompt that takes a fresh agent session to the working state of
this app. Every warning woven into it corresponds to a failure that was
actually hit while building this; don't trim them.

---

Create a new AnalogJS + CopilotKit + OpenRouter app for me — one fullstack
Angular app where the Copilot Runtime and the agent both run inside Analog's
Nitro server, all TypeScript. The product is a trip planner called Sacbé
(named for the Maya white roads): the human and the agent co-edit an
itinerary of days and timed stops, and the agent can check real weather,
search the web for current trip facts, and ask permission before destructive
changes.

First confirm that this machine has Node.js 22+, Git/network access, and an
OpenRouter key available. Do not ask me to paste secrets into chat — tell me
which line of .env each key goes on and I'll add it myself.

Use pnpm 12 throughout: scaffold a fresh Analog app (pnpm create analog
--name <ask me for the name>), then pin it with packageManager in
package.json so corepack takes over. Put project settings in
pnpm-workspace.yaml — pnpm 12 no longer reads the "pnpm" field in
package.json or most .npmrc keys — including strictPeerDependencies: false
(Angular 21 next to peers reaching for 22), the version overrides below, and
an allowBuilds map approving esbuild, lmdb, msgpackr-extract and
@parcel/watcher, since pnpm blocks dependency build scripts by default and
Vite won't run without esbuild's binary. Make the app client-rendered, since
the CopilotKit components aren't SSR-safe.
Before wiring anything, fix Analog's starter config: put "browser" first in
resolve.mainFields and shim window.process in index.html before the module
script, or CopilotKit's browser bundles crash on Node globals — and never
enable the static build option, it silently drops the API routes from
production builds.

Ask me whether I want hosted threads. If yes, walk me through npx
copilotkit@latest login and provisioning an Intelligence project with the
CLI. Pause and guide me whenever I must complete a browser action. Explain
that this provisions a free license and hosted threads; it does not set up a
self-hosted Intelligence deployment. If I skip it, use the in-memory runner
and tell me the threads UI stays locked.

Install @copilotkit/angular with matching runtime/core/shared versions and
@openrouter/ai-sdk-provider@2 — the 3.x line needs ai v7 and won't resolve
against the runtime's bundled ai v6. Pin rxjs to a single version in both
dependencies and overrides, or @ag-ui/client's exact pin duplicates it and
breaks Observable typing; pin the @ag-ui/* and @copilotkit/* packages to one
version each for the same reason. The global stylesheet MUST start with @import
"@copilotkit/angular/styles.css" — without it the chat renders unstyled —
and because the SDK's CSS lives in @layer, any unlayered global rule you
write (a focus outline, for example) silently overrides it: scope such
globals away from copilot-* elements and [data-copilotkit] subtrees so the
SDK owns its own components.

On the server, build one module that owns the runtime: warn-only env checks
at the top (missing OpenRouter key, license token without its API key,
optional search key — the module that needs the vars is the place that
complains about them; no separate check scripts), then a BuiltInAgent from
@copilotkit/runtime/v2 on a free OpenRouter model. Default to
"openrouter/free" — OpenRouter's router across the whole free pool, which
dodges per-model rate limits and filters for tool support — overridable via
OPENROUTER_MODEL; if pinning a specific free model instead, verify with a
live request that it can actually call tools before committing to it. Then
mount everything with createCopilotHonoHandler at /api/copilotkit from an
index route and a catch-all route sharing that one instance. Attach a
middleware that converts model-stream failures (rate limits, auth errors)
into a friendly assistant message plus a clean RUN_FINISHED instead of an
opaque crash — intercept the RUN_ERROR event itself, closing any half-open
message or tool call first, since events after a terminal one are rejected.
Set forwardSystemMessages: true on the agent, or the hosted thread-namer's
instructions (sent as a system message) get dropped and every thread shows
"Untitled".

Route every turn before generating, the way a production agent should: one
cheap temperature-0 classification (plan / edit / remove / weather / search /
clear / chat) picks the tool path, and its guidance — the exact tool
sequence — is injected as a context item for that turn only. Give the
classifier a short timeout and one retry so a flaky free model degrades to
plain chat instead of stalling the user's turn, and parse the intent keyword
out of whatever comes back rather than trusting the output format. Where
plain code can decide everything, skip the model entirely: for a clear/delete
request, resolve the target from the message ("day 2", a day's label, "borra
todo el viaje") and have the SERVER author the whole run — a short text
message plus a hand-built clear_trip tool call plus RUN_FINISHED — so the
destructive path never depends on the model choosing correctly. Fall back to
guided generation when the target is ambiguous.

Give the agent three server tools and two frontend surfaces. get_weather
hits Open-Meteo (geocode then forecast, no API key) and returns compact
JSON. search_web uses Tavily but is NOT an open search box: parameters are a
required place, a topic from a fixed enum (restaurants, activities, sights,
events, practical), and the specific thing to find — the server composes the
query, caps it at 5 basic-depth results, and returns a clear "not
configured" message when TAVILY_API_KEY is unset so the agent degrades
honestly instead of failing. The prompt allows at most one search per
request and forbids searching for anything that isn't a current, changeable
fact about a place in the trip. On the frontend, register clear_trip as a
human-in-the-loop tool — the agent proposes clearing the trip or removing a
day, the run pauses on an approval card, and my click becomes the tool
result — plus a setThemeColor frontend tool that drives the design system's
accent token. Render generative-UI cards for the weather (live values,
streaming and error states) and for search results (source links, so claims
are checkable).

The itinerary is CLIENT-owned in an NgRx Signal Store (@ngrx/signals),
layered domain/application/ui: pure models and id factories in domain,
signalStore(withTrip(), withCopilotKit()) in application, presentation-only
components in ui. withTrip holds state, computed signals, deterministic
methods, and localStorage persistence; withCopilotKit (composed after it,
typed via type<StateSlice>() inputs, wired in onInit for injection context)
connects the live trip as agent context and registers granular zod-validated
frontend tools — set_trip_name, upsert_day, upsert_stop, remove_stop,
select_day. Do NOT give the agent a full-state snapshot channel or a
day-removal tool: complete-state resends are exactly what free models flub
(partial snapshots wipe boards), and whole days must leave the trip only
through the clear_trip approval. The prompt tells the model to reuse the
exact ids from the context and that a change is real only when a tool
returned ok: true. Start with an empty board — no seeded example trip.
Persist each conversation's board under its thread id, so a new conversation
opens an empty road and returning to an old one restores its itinerary.
Suggestions: a few fixed starters before the first message, then
AI-generated follow-ups grounded in the current trip state.

Handle the thread lifecycle defensively, because the hosted platform makes
deleted threads permanently unusable — their ids return 404 on read and 409
on re-create, so a client that remembers one can never run again in that
conversation. Always start the session on a freshly minted thread id, and
activate a remembered conversation (a ?thread= deep link, or the stash that
carries the conversation across a language switch) only after confirming it
appears in the loaded thread list. Handle the drawer's delete event yourself
— reset the chat and drop that conversation's board even when the
platform-side delete fails — and reset when the active thread disappears
from the list. Keep the active conversation in the URL with replaceState so
links are shareable and refresh-safe.

When the model stream dies (rate limit, timeout, bad key), never surface raw
errors or internal model ids in the chat: log the detail server-side and
show a short message in the user's language, in the app's own voice — for a
trip planner, traffic on the road, taking the scenic route, papers rejected
at the border.

Design it with intent, not defaults: a limestone canvas, jungle-ink text, a
cenote-teal accent and sun-amber markers, a characterful display face over a
quiet body face, and one signature element — the itinerary drawn as a white
road down the page with stone markers at each stop. Angular DI, signals, and
zoneless change detection throughout; respect reduced motion and keep focus
states visible on the planner's own controls.

Then run the available checks and report exactly what you verified:
typecheck, production build including the server output,
/api/copilotkit/info, and live agent runs covering an edit request that
produces the correct granular tool call (exact dayId from the context), a
real weather lookup, a scoped search call, and a destructive request that
the server resolves and authors deterministically (no model call). If threads are enabled, flag any placeholder user
identity that must be replaced before production. Let me test in the browser
myself before we go further.
