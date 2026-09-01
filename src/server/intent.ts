// Intent routing, adapted from the MacroQuest reference architecture: one
// cheap temperature-0 classification per user turn decides which tools the
// main generation is steered toward (via a guidance context item injected in
// agent.ts). Routing stays model-driven, but tool USAGE stops being a free
// choice the model can narrate its way around — the main cause of "I changed
// it" claims with no tool call behind them. If classification fails (model
// down, aborted, garbage output), we degrade to "chat": no guidance, the
// prompt's own rules still apply.
import { generateText } from "ai";
import { model } from "./model";

export type TripIntent =
  | "plan"
  | "edit"
  | "remove"
  | "weather"
  | "search"
  | "clear"
  | "chat";

const INTENTS: TripIntent[] = [
  "plan",
  "edit",
  "remove",
  "weather",
  "search",
  "clear",
  "chat",
];

interface MessageLike {
  role?: string;
  content?: unknown;
}

const textOf = (m: MessageLike | undefined): string =>
  typeof m?.content === "string" ? m.content : "";

/** Last few user/assistant lines, truncated — cheap context for routing. */
function historyDigest(messages: MessageLike[], limit: number): string {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && textOf(m))
    .slice(-limit)
    .map((m) => `${m.role}: ${textOf(m).slice(0, 160)}`)
    .join("\n");
}

function buildIntentPrompt(history: string, latest: string): string {
  return [
    "Classify the user's LATEST request for a trip-planner app. Answer with ONLY one word from: plan, edit, remove, weather, search, clear, chat.",
    "Intents:",
    '- "plan": plan a day or a whole trip, add one or more new days or stops (restaurants, sights, activities) to the itinerary.',
    '- "edit": change something that already exists on the board — rename, retime, move, swap a stop or the trip name, switch the visible day.',
    '- "remove": remove ONE specific stop from a day.',
    '- "weather": asks about weather or forecast.',
    '- "search": wants current facts about a place — restaurant recommendations, opening hours, prices, events, tours — WITHOUT adding them to the trip yet.',
    '- "clear": wants to delete a whole day or empty/reset the whole trip.',
    '- "chat": everything else (greetings, questions about the current plan, general travel talk).',
    history ? `Conversation:\n${history}` : "",
    `Latest user message: ${latest}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function classifyIntent(
  messages: MessageLike[],
): Promise<TripIntent> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const latest = textOf(lastUser);
  if (!latest) return "chat";
  try {
    const { text } = await generateText({
      model,
      prompt: buildIntentPrompt(historyDigest(messages, 6), latest),
      temperature: 0,
      // Reasoning-tuned free models may spend tokens thinking before the
      // one-word answer; give headroom and parse the keyword out of whatever
      // comes back rather than trusting the format.
      maxOutputTokens: 200,
      // Routing is an enhancement — fail FAST to the chat fallback rather
      // than letting a flaky free-pool model stall the user's actual turn.
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(6000),
    });
    const lowered = text.toLowerCase();
    const found = INTENTS.filter((i) => lowered.includes(i));
    // Prefer the LAST mentioned intent — reasoning text often enumerates
    // candidates before settling.
    return found.at(-1) ?? "chat";
  } catch {
    return "chat";
  }
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export interface ClearTarget {
  scope: "trip" | "day";
  dayId?: string;
}

/**
 * Deterministic target resolution for the clear intent — plain code, no
 * model: "día 2"/"day 2" → the nth day; a day's label or location word in
 * the message → that day; whole-trip phrasing → trip. Returns null when
 * ambiguous, and the caller falls back to model guidance.
 */
export function resolveClearTarget(
  latest: string,
  days: { id: string; label?: string; location?: string }[],
): ClearTarget | null {
  const text = fold(latest);
  // Ordinal day reference: "día 2", "day 2", "dia2"
  const ordinal = text.match(/\b(?:dia|day)\s*(\d{1,2})\b/);
  if (ordinal) {
    const day = days[parseInt(ordinal[1], 10) - 1];
    if (day) return { scope: "day", dayId: day.id };
  }
  // Unique label/location word match (≥4 chars so "de"/"el" can't match)
  const matches = days.filter((d) =>
    fold(`${d.label ?? ""} ${d.location ?? ""}`)
      .split(/[^a-z0-9]+/)
      .some((w) => w.length >= 4 && text.includes(w)),
  );
  if (matches.length === 1) return { scope: "day", dayId: matches[0].id };
  if (
    /(todo el viaje|whole trip|entire trip|everything|empezar de nuevo|start over|desde cero|from scratch|reset|vaciar|empty the trip|borra todo|delete all|clear the trip|clear all)/.test(
      text,
    )
  ) {
    return { scope: "trip" };
  }
  return null;
}

/**
 * Per-intent steering injected as a context item for the main generation.
 * Each line names the EXACT tool sequence so the model routes instead of
 * improvising. "chat" gets none.
 */
export const INTENT_GUIDANCE: Record<TripIntent, string | null> = {
  plan: "ROUTING for this turn: the user wants planning. For each new day call upsert_day (label, location, date when known), then upsert_stop for each stop (3-6 per day), then select_day. Do NOT describe a plan without making these calls.",
  edit: "ROUTING for this turn: the user wants to change something that already exists. Find it in the trip context and call the matching tool — upsert_stop, upsert_day, set_trip_name, or select_day — with its EXACT id. Do NOT claim the change without the call succeeding.",
  remove:
    "ROUTING for this turn: the user wants a stop removed. Call remove_stop with the exact dayId and stopId from the trip context. If they mean a whole day or the whole trip, call clear_trip instead and wait for their decision.",
  weather:
    "ROUTING for this turn: the user asks about weather. Call get_weather with the full location name and the day's date if known, then summarize.",
  search:
    "ROUTING for this turn: the user wants current facts about a place. Call search_web once (place, topic, query), then answer from the results citing the source briefly.",
  clear:
    "ROUTING for this turn: the user wants a day or the whole trip removed. Call clear_trip with the right scope and wait — only their approval in the interface makes it happen.",
  chat: null,
};
