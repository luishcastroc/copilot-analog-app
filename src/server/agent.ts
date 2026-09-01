// The default agent: model + prompt + server tools, hardened by the
// resilience middleware and steered by per-turn intent routing (see
// intent.ts — adapted from the MacroQuest reference architecture). Frontend
// tools (trip edits, setThemeColor, clear_trip) are registered client-side
// and forwarded automatically over AG-UI.
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import { EventType, type BaseEvent } from "@ag-ui/core";
import { randomUUID } from "node:crypto";
import { from, mergeMap, of } from "rxjs";
import {
  INTENT_GUIDANCE,
  classifyIntent,
  resolveClearTarget,
} from "./intent";
import { model } from "./model";
import { TRIP_PLANNER_PROMPT } from "./prompt";
import { attachResilienceMiddleware, looksSpanish } from "./resilience";
import { getWeather } from "./tools/weather";
import { searchWeb } from "./tools/search";

export const defaultAgent = new BuiltInAgent({
  model,
  prompt: TRIP_PLANNER_PROMPT,
  tools: [getWeather, searchWeb],
  // Allow tool call(s) followed by a text summary in one run.
  maxSteps: 5,
  // Low temperature narrows the sampling variance behind "phantom actions" —
  // the free model claiming a change without emitting the state tool call.
  // Doesn't fix capability (a stronger OPENROUTER_MODEL does), but makes the
  // usual draw the tool-calling one.
  temperature: 0.2,
  // The Intelligence thread-namer clones this agent and delivers its
  // instructions ("return JSON {title}") as a system-role MESSAGE — which
  // BuiltInAgent drops by default, so every title came back invalid and
  // threads showed "Untitled". Our own chat client never sends system
  // messages, so forwarding them only enables the namer.
  forwardSystemMessages: true,
});

attachResilienceMiddleware(defaultAgent);

/** Days list from the trip context the frontend rides along with each run. */
function daysFromContext(
  context: { value?: string }[] | undefined,
): { id: string; label?: string; location?: string }[] {
  for (const c of context ?? []) {
    try {
      const parsed = JSON.parse(c.value ?? "");
      if (Array.isArray(parsed?.days)) return parsed.days;
    } catch {
      /* not the trip context */
    }
  }
  return [];
}

/**
 * Server-authored run: a text line + a clear_trip tool call + a clean
 * finish, with ZERO model involvement — the AG-UI equivalent of the
 * reference architecture's `yield textChunk(...)` / `yield* toolCallEvents(...)`.
 * The client's HITL card renders the call; the human's click is the result.
 */
function deterministicClearRun(
  input: { threadId: string; runId: string },
  args: { scope: "trip" | "day"; dayId?: string; reason: string },
  es: boolean,
): BaseEvent[] {
  const messageId = randomUUID();
  const toolCallId = randomUUID();
  const text = es
    ? "Esto necesita tu aprobación 👇"
    : "This one needs your approval 👇";
  return [
    { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId },
    { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text },
    { type: EventType.TEXT_MESSAGE_END, messageId },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: "clear_trip",
      parentMessageId: messageId,
    },
    { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(args) },
    { type: EventType.TOOL_CALL_END, toolCallId },
    { type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId },
  ] as unknown as BaseEvent[];
}

// Intent routing: classify each fresh user turn (temperature 0, tiny), then
// steer — and where routing plus plain code can decide EVERYTHING, bypass
// the model entirely (the whole point is determinism):
//   clear + resolvable target → server-authored clear_trip run, no LLM.
//   other intents → guidance context injected for the main generation.
// Skipped for continuation runs (last message isn't the user's — tool
// results, HITL resumes) and for the thread-namer's cloned runs (they carry
// a system message and must stay untouched).
defaultAgent.use((input, next) => {
  const messages = (input.messages ?? []) as {
    role?: string;
    content?: unknown;
  }[];
  const last = messages[messages.length - 1];
  const isFreshUserTurn = last?.role === "user";
  const isTitleRun = messages.some((m) => m.role === "system");
  if (!isFreshUserTurn || isTitleRun) return next.run(input);
  return from(classifyIntent(messages)).pipe(
    mergeMap((intent) => {
      console.log(`[agent] intent: ${intent}`);
      if (intent === "clear") {
        const latest = typeof last?.content === "string" ? last.content : "";
        const hasClearTool = (
          (input.tools ?? []) as { name?: string }[]
        ).some((t) => t.name === "clear_trip");
        const target = hasClearTool
          ? resolveClearTarget(latest, daysFromContext(input.context))
          : null;
        if (target) {
          console.log(
            `[agent] deterministic clear_trip (${target.scope}${target.dayId ? `: ${target.dayId}` : ""})`,
          );
          return of(
            ...deterministicClearRun(
              input,
              { ...target, reason: latest.slice(0, 140) },
              looksSpanish(input),
            ),
          );
        }
      }
      const guidance = INTENT_GUIDANCE[intent];
      if (!guidance) return next.run(input);
      return next.run({
        ...input,
        context: [
          ...(input.context ?? []),
          { description: "Routing guidance for THIS turn only", value: guidance },
        ],
      });
    }),
  );
});
