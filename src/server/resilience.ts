// Middleware that makes the agent survive provider outages: a dead LLM
// stream becomes a friendly assistant message instead of an opaque crash.
// (A middleware, not a subclass: BuiltInAgent.clone() preserves middlewares.)
//
// Historical note: this file once also normalized/merged AGUISendStateSnapshot
// payloads to defend the shared-state channel against partial snapshots from
// free models. That channel no longer exists — the trip is client-owned in an
// NgRx signal store and the agent edits it through validated frontend tools —
// so the state machinery was removed with it.
import type { BuiltInAgent } from "@copilotkit/runtime/v2";
import { EventType, type BaseEvent } from "@ag-ui/core";
import { EMPTY, catchError, mergeMap, of } from "rxjs";
import { randomUUID } from "node:crypto";
import { MODEL_ID } from "./model";

interface HistoryMessage {
  id?: string;
  role?: string;
  toolCallId?: string;
  toolCalls?: { id?: string }[];
}

/**
 * Every assistant tool call must be answered by a `role: "tool"` message, or
 * the AI SDK refuses the whole conversation with MissingToolResultsError —
 * permanently, on every later turn. Orphans happen when a run dies between
 * the call and its result (rate limit, timeout) or when a human-in-the-loop
 * card is ignored and the user just types something else. Synthesize the
 * missing results so an interrupted turn can't brick the conversation.
 */
export function repairOrphanedToolCalls<T>(messages: T[]): T[] {
  const list = messages as HistoryMessage[];
  const answered = new Set(
    list
      .filter((m) => m.role === "tool" && typeof m.toolCallId === "string")
      .map((m) => m.toolCallId as string),
  );
  const repaired: HistoryMessage[] = [];
  let orphans = 0;
  for (const message of list) {
    repaired.push(message);
    if (message.role !== "assistant" || !message.toolCalls?.length) continue;
    for (const call of message.toolCalls) {
      if (!call?.id || answered.has(call.id)) continue;
      answered.add(call.id);
      orphans++;
      repaired.push({
        id: randomUUID(),
        role: "tool",
        toolCallId: call.id,
        content: JSON.stringify({
          ok: false,
          error: "No result was recorded for this call (the run was interrupted).",
        }),
      } as HistoryMessage & { content: string });
    }
  }
  if (orphans > 0) {
    console.warn(
      `[agent] repaired ${orphans} tool call(s) with no result — the conversation would otherwise fail permanently`,
    );
  }
  return repaired as T[];
}

/** Everything reachable in an error's message/cause chain, for classifying. */
const errorText = (err: unknown): string => {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
    } else {
      try {
        parts.push(JSON.stringify(cur));
      } catch {
        parts.push(String(cur));
      }
      break;
    }
  }
  return parts.join(" | ");
};

/** Crude but effective: does the user's last message look Spanish? */
export const looksSpanish = (input: { messages?: { role?: string; content?: unknown }[] }): boolean => {
  const lastUser = [...(input.messages ?? [])]
    .reverse()
    .find((m) => m.role === "user");
  const text =
    typeof lastUser?.content === "string" ? lastUser.content : "";
  return /[¿¡ñáéíóú]|\b(el|la|los|las|una?|que|por|para|con|día|viaje)\b/i.test(
    text,
  );
};

/**
 * User-facing copy for a dead model stream: short, human, in the user's
 * language, with NO raw errors, JSON, or internal model ids — those go to
 * the server log instead. Only the LLM provider (OpenRouter) lives in the
 * stream path — tool failures (Tavily, Open-Meteo) are returned as tool
 * RESULTS and never end up here.
 */
const friendlyFailure = (
  input: {
    threadId: string;
    runId: string;
    messages?: { role?: string; content?: unknown }[];
  },
  text: string,
  open: { textMessageId?: string; toolCallIds: Set<string> },
): BaseEvent[] => {
  const es = looksSpanish(input);
  let message: string;
  if (/rate.?limit|429/i.test(text)) {
    message = es
      ? "🚌 Tráfico pesado en el sacbé — demasiados viajeros a la vez. Dame un minutito a la sombra y retomamos el camino."
      : "🚌 Heavy traffic on the sacbé — too many travelers at once. Give me a minute in the shade and we'll get back on the road.";
  } else if (/timeout|timed?.?out|504|aborted/i.test(text)) {
    message = es
      ? "🗺️ Tomé la ruta escénica y me perdí un poco… Pídemelo otra vez — en tramos más cortos llegamos más rápido."
      : "🗺️ I took the scenic route and got a little lost… Ask me again — shorter legs of the journey get us there faster.";
  } else if (/401|403|unauthorized|invalid.*key/i.test(text)) {
    message = es
      ? "🛂 Me rechazaron los papeles en la frontera: la clave de API no pasó. Revisa OPENROUTER_API_KEY en .env, reinicia, y seguimos el viaje."
      : "🛂 My papers got rejected at the border: the API key didn't make it through. Check OPENROUTER_API_KEY in .env, restart, and we're traveling again.";
  } else {
    message = es
      ? "🛞 Encontramos un bache en el camino. Dale otra vez en un momento — el viaje sigue."
      : "🛞 We hit a pothole on the road. Try again in a moment — the trip goes on.";
  }
  console.warn(
    `[agent] OpenRouter stream failed (model ${MODEL_ID}): ${text.slice(0, 300)}`,
  );
  const messageId = randomUUID();
  return [
    // Close anything the crash left half-open, or the appended message would
    // make the AG-UI event sequence invalid. Every closed call also needs a
    // RESULT: an unanswered tool call poisons the conversation permanently
    // (MissingToolResultsError on every later turn).
    ...[...open.toolCallIds].flatMap((toolCallId) => [
      { type: EventType.TOOL_CALL_END, toolCallId },
      {
        type: EventType.TOOL_CALL_RESULT,
        role: "tool",
        messageId: randomUUID(),
        toolCallId,
        content: JSON.stringify({
          ok: false,
          error: "The run was interrupted before this tool finished.",
        }),
      },
    ]),
    ...(open.textMessageId
      ? [{ type: EventType.TEXT_MESSAGE_END, messageId: open.textMessageId }]
      : []),
    { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: message },
    { type: EventType.TEXT_MESSAGE_END, messageId },
    {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
    },
  ] as unknown as BaseEvent[];
};

export function attachResilienceMiddleware(agent: BuiltInAgent): void {
  agent.use((input, next) => {
    const open: { textMessageId?: string; toolCallIds: Set<string> } = {
      toolCallIds: new Set(),
    };
    // Once we substitute a friendly ending (for a RUN_ERROR event), the run
    // is over: drop anything the source emits or throws afterwards —
    // downstream verification rejects events after a terminal one.
    let substituted = false;
    return next
      .run({ ...input, messages: repairOrphanedToolCalls(input.messages ?? []) })
      .pipe(
      mergeMap((event: BaseEvent) => {
        if (substituted) return EMPTY;
        const e = event as BaseEvent & {
          messageId?: string;
          toolCallId?: string;
          message?: string;
        };
        // BuiltInAgent reports stream failures as a RUN_ERROR *event* (and
        // may error the observable right after). Swallow it and end the run
        // as a normal assistant message + RUN_FINISHED instead.
        if (event.type === EventType.RUN_ERROR) {
          substituted = true;
          return of(
            ...friendlyFailure(input, e.message ?? "unknown error", open),
          );
        }
        // Track open message/tool-call so a crash can close them cleanly.
        if (event.type === EventType.TEXT_MESSAGE_START) {
          open.textMessageId = e.messageId;
        } else if (event.type === EventType.TEXT_MESSAGE_END) {
          open.textMessageId = undefined;
        } else if (event.type === EventType.TOOL_CALL_START) {
          if (e.toolCallId) open.toolCallIds.add(e.toolCallId);
        } else if (event.type === EventType.TOOL_CALL_RESULT) {
          // Answered — no longer at risk of orphaning. (END alone isn't
          // enough: the result is what the next turn's history needs.)
          if (e.toolCallId) open.toolCallIds.delete(e.toolCallId);
        }
        return of(event);
      }),
      catchError((err: unknown) => {
        if (substituted) return EMPTY;
        substituted = true;
        return of(...friendlyFailure(input, errorText(err), open));
      }),
    );
  });
}
