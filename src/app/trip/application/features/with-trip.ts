import { computed, effect } from "@angular/core";
import { injectChatConfiguration } from "@copilotkit/angular";
import {
  patchState,
  signalStoreFeature,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from "@ngrx/signals";
import { createDay, createEntry } from "../../domain/trip.factory";
import {
  initialTripState,
  stopCount,
  type TripDay,
  type TripEntry,
  type TripState,
} from "../../domain/trip.models";
import type { UpsertDayInput, UpsertStopInput } from "../trip-store.types";

const STORAGE_PREFIX = "sacbe-trip:";
const LEGACY_STORAGE_KEY = "sacbe-trip";

/** Drop a conversation's persisted board (called when its thread is deleted). */
export function removeStoredTrip(threadId: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + threadId);
  } catch {
    /* ignore */
  }
}

/**
 * Each CONVERSATION owns its trip: boards persist per thread id, so "+ New"
 * starts an empty road and returning to an old conversation brings its trip
 * back. The one legacy global board (pre per-thread) is adopted by the first
 * thread that loads and the old key removed.
 */
function loadTripFor(threadId: string): TripState {
  try {
    let raw = localStorage.getItem(STORAGE_PREFIX + threadId);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    if (!raw) return initialTripState;
    const parsed = JSON.parse(raw) as Partial<TripState>;
    return {
      tripName: typeof parsed.tripName === "string" ? parsed.tripName : "",
      days: Array.isArray(parsed.days) ? (parsed.days as TripDay[]) : [],
      selectedDayId:
        typeof parsed.selectedDayId === "string" ? parsed.selectedDayId : "",
    };
  } catch {
    return initialTripState;
  }
}

/**
 * Core domain feature: the itinerary, its selection, and derived signals.
 * The trip is CLIENT-owned (persisted to localStorage) — the agent edits it
 * exclusively through the frontend tools in with-copilot.ts, so every write
 * below is deterministic and validated. There is no snapshot channel to
 * corrupt.
 */
export function withTrip() {
  return signalStoreFeature(
    withState<TripState>(initialTripState),
    withComputed((store) => ({
      // Explicit return type: days[0] on an empty array is undefined at
      // runtime, but unchecked indexed access would infer plain TripDay —
      // a lie that breaks ?. usage downstream (NG8107).
      selectedDay: computed((): TripDay | undefined => {
        const days = store.days();
        return days.find((d) => d.id === store.selectedDayId()) ?? days[0];
      }),
      dayCount: computed(() => store.days().length),
      totalStops: computed(() => stopCount(store.days())),
    })),
    withMethods((store) => ({
      setTripName(name: string): void {
        patchState(store, { tripName: name.trim() });
      },
      selectDay(dayId: string): boolean {
        if (!store.days().some((d) => d.id === dayId)) return false;
        patchState(store, { selectedDayId: dayId });
        return true;
      },
      upsertDay(input: UpsertDayInput): TripDay {
        const days = store.days();
        const existing = input.id
          ? days.find((d) => d.id === input.id)
          : undefined;
        if (existing) {
          const updated: TripDay = {
            ...existing,
            label: input.label || existing.label,
            date: input.date ?? existing.date,
            location: input.location ?? existing.location,
          };
          patchState(store, {
            days: days.map((d) => (d.id === updated.id ? updated : d)),
            selectedDayId: updated.id,
          });
          return updated;
        }
        const day = createDay(input, days);
        patchState(store, {
          days: [...days, day],
          selectedDayId: day.id,
        });
        return day;
      },
      upsertStop(
        dayId: string,
        input: UpsertStopInput,
      ): TripEntry | undefined {
        const day = store.days().find((d) => d.id === dayId);
        if (!day) return undefined;
        const existing = input.id
          ? day.entries.find((e) => e.id === input.id)
          : undefined;
        const entry: TripEntry = existing
          ? {
              ...existing,
              ...input,
              id: existing.id,
              title: input.title || existing.title,
            }
          : createEntry(input, day.entries);
        const entries = existing
          ? day.entries.map((e) => (e.id === entry.id ? entry : e))
          : [...day.entries, entry];
        // Keep the road ordered by time when times are comparable.
        entries.sort((a, b) => (a.time ?? "~").localeCompare(b.time ?? "~"));
        patchState(store, {
          days: store
            .days()
            .map((d) => (d.id === dayId ? { ...d, entries } : d)),
          selectedDayId: dayId,
        });
        return entry;
      },
      removeStop(dayId: string, stopId: string): boolean {
        const day = store.days().find((d) => d.id === dayId);
        if (!day || !day.entries.some((e) => e.id === stopId)) return false;
        patchState(store, {
          days: store
            .days()
            .map((d) =>
              d.id === dayId
                ? { ...d, entries: d.entries.filter((e) => e.id !== stopId) }
                : d,
            ),
        });
        return true;
      },
      // Destructive by design: NOT exposed to the agent as a tool — only the
      // clear_trip human-in-the-loop approval calls these.
      removeDay(dayId: string): boolean {
        const days = store.days();
        if (!days.some((d) => d.id === dayId)) return false;
        const remaining = days.filter((d) => d.id !== dayId);
        patchState(store, {
          days: remaining,
          selectedDayId:
            store.selectedDayId() === dayId
              ? (remaining[0]?.id ?? "")
              : store.selectedDayId(),
        });
        return true;
      },
      clearTrip(): void {
        patchState(store, { days: [], selectedDayId: "" });
      },
    })),
    withHooks({
      onInit(store) {
        // One effect binds the board to the active conversation: when the
        // thread changes (new conversation, drawer switch, deletion reset),
        // load that thread's trip — otherwise persist the current trip under
        // the bound thread's key. Reading the state snapshot BEFORE the
        // branch keeps the effect subscribed to state changes either way.
        const chatConfig = injectChatConfiguration();
        let boundThread: string | null = null;
        effect(() => {
          const threadId = chatConfig.threadId();
          const snapshot: TripState = {
            tripName: store.tripName(),
            days: store.days(),
            selectedDayId: store.selectedDayId(),
          };
          if (threadId !== boundThread) {
            boundThread = threadId;
            patchState(store, loadTripFor(threadId));
            return; // the reload re-runs this effect, which then persists
          }
          try {
            localStorage.setItem(
              STORAGE_PREFIX + threadId,
              JSON.stringify(snapshot),
            );
          } catch {
            /* storage unavailable — trip lives for the session only */
          }
        });
      },
    }),
  );
}
