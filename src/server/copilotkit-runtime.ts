// Composition root: Copilot Runtime + request handler. Both server routes
// (api/copilotkit/index.ts and api/copilotkit/[...].ts) import from here so a
// single runtime serves the base path and every sub-path.
//
//   env-checks.ts   — startup warnings for missing/placeholder env vars
//   model.ts        — OpenRouter provider + MODEL_ID
//   prompt.ts       — the trip-planner system prompt
//   tools/          — get_weather (Open-Meteo), search_web (Tavily, scoped)
//   resilience.ts   — state normalization + friendly stream-failure recovery
//   agent.ts        — assembles the BuiltInAgent from all of the above
import "dotenv/config";
import { defineEventHandler, toWebRequest, type H3Event } from "h3";
import {
  CopilotKitIntelligence,
  CopilotRuntime,
  InMemoryAgentRunner,
  createCopilotHonoHandler,
} from "@copilotkit/runtime/v2";
import { dedupeNoisySdkWarnings, warnOnMissingEnv } from "./env-checks";
import { defaultAgent } from "./agent";

warnOnMissingEnv();
dedupeNoisySdkWarnings();

const runtime = new CopilotRuntime({
  agents: {
    default: defaultAgent,
  },
  // --- copilotkit:intelligence (remove this block to opt out) ---
  ...(process.env.COPILOTKIT_LICENSE_TOKEN
    ? {
        intelligence: new CopilotKitIntelligence({
          apiKey: process.env.INTELLIGENCE_API_KEY ?? "",
          ...(process.env.INTELLIGENCE_API_URL
            ? { apiUrl: process.env.INTELLIGENCE_API_URL }
            : {}),
          ...(process.env.INTELLIGENCE_GATEWAY_WS_URL
            ? { wsUrl: process.env.INTELLIGENCE_GATEWAY_WS_URL }
            : {}),
        }),
        // Single-user stub — replace with your real auth-derived identity
        // before any multi-user deployment, or all users share one thread
        // history. The id should correspond to a user that exists in
        // CopilotKit Intelligence; a hardcoded literal (whatever its name)
        // can still make thread operations fail with THREAD_NOT_FOUND.
        // Overridable via COPILOTKIT_USER_ID. NOTE: changing the id orphans
        // threads created under the previous one — the drawer starts empty.
        identifyUser: () => ({
          id: process.env.COPILOTKIT_USER_ID ?? "sacbe-user",
          name: "Sacbé User",
        }),
        licenseToken: process.env.COPILOTKIT_LICENSE_TOKEN,
      }
    : { runner: new InMemoryAgentRunner() }),
  // --- /copilotkit:intelligence ---
});

const endpoint = createCopilotHonoHandler({
  runtime,
  basePath: "/api/copilotkit",
});

export const copilotKitHandler = defineEventHandler((event: H3Event) => {
  return endpoint.fetch(toWebRequest(event));
});
