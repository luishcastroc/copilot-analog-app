import { computed } from "@angular/core";
import {
  connectAgentContext,
  registerFrontendTool,
} from "@copilotkit/angular";
import { signalStoreFeature, type, withHooks } from "@ngrx/signals";
import { z } from "zod";
import type {
  TripDerivedSignals,
  TripMethods,
  TripStateSlice,
} from "../trip-store.types";

const stopSchema = z.object({
  id: z
    .string()
    .optional()
    .describe("Existing stop id when editing; omit when adding"),
  title: z.string().describe("Short title of the stop"),
  time: z.string().optional().describe('Short label like "09:30" or "sunset"'),
  note: z.string().optional().describe("One-line detail"),
  address: z
    .string()
    .optional()
    .describe(
      "Street address or unambiguous landmark of the EXACT branch (chains have many locations)",
    ),
  category: z
    .enum(["food", "sight", "nature", "stay", "travel", "other"])
    .optional(),
});

/**
 * Connects the agent to the trip store: live context plus deterministic,
 * zod-validated frontend tools for every edit. Must be composed after
 * {@link withTrip}, whose state/methods it reads; the `onInit` hook supplies
 * the injection context the CopilotKit `connect*`/`register*` helpers
 * require. Deliberately absent: any tool that removes a day or clears the
 * trip — that path exists only as the clear_trip human-in-the-loop approval.
 */
export function withCopilotKit() {
  return signalStoreFeature(
    {
      state: type<TripStateSlice>(),
      props: type<TripDerivedSignals>(),
      methods: type<TripMethods>(),
    },
    withHooks({
      onInit(store) {
        connectAgentContext(
          computed(() => ({
            description:
              "Current trip itinerary — the authoritative live board from the Angular signal store. Reuse these exact ids when editing.",
            value: JSON.stringify({
              tripName: store.tripName(),
              selectedDayId: store.selectedDayId(),
              days: store.days(),
            }),
          })),
        );

        registerFrontendTool({
          name: "set_trip_name",
          description: "Name or rename the trip.",
          parameters: z.object({ name: z.string() }),
          handler: async ({ name }) => {
            store.setTripName(name);
            return { ok: true, tripName: name.trim() };
          },
        });

        registerFrontendTool({
          name: "upsert_day",
          description:
            "Add a day to the trip, or update an existing day's label/date/location when an id is given. Returns the day id — use it for upsert_stop.",
          parameters: z.object({
            id: z
              .string()
              .optional()
              .describe("Existing day id when editing; omit when adding"),
            label: z.string().describe('e.g. "Day 1 · Mérida"'),
            date: z.string().optional().describe("YYYY-MM-DD when known"),
            location: z
              .string()
              .optional()
              .describe('"City, Country" — powers weather hints'),
          }),
          handler: async (input) => {
            const day = store.upsertDay(input);
            return { ok: true, dayId: day.id, label: day.label };
          },
        });

        registerFrontendTool({
          name: "upsert_stop",
          description:
            "Add a stop to a day, or update an existing stop when its id is given. Days are ordered by time automatically.",
          parameters: z.object({
            dayId: z.string().describe("Id of the day (from upsert_day or context)"),
            stop: stopSchema,
          }),
          handler: async ({ dayId, stop }) => {
            const entry = store.upsertStop(dayId, stop);
            return entry
              ? { ok: true, dayId, stopId: entry.id }
              : {
                  ok: false,
                  error: `No day with id "${dayId}" — check the trip context and use upsert_day first.`,
                };
          },
        });

        registerFrontendTool({
          name: "remove_stop",
          description: "Remove one stop from a day.",
          parameters: z.object({
            dayId: z.string(),
            stopId: z.string(),
          }),
          handler: async ({ dayId, stopId }) => {
            const ok = store.removeStop(dayId, stopId);
            return ok
              ? { ok: true }
              : { ok: false, error: `No stop "${stopId}" on day "${dayId}".` };
          },
        });

        registerFrontendTool({
          name: "select_day",
          description: "Switch which day is visible on the board.",
          parameters: z.object({ dayId: z.string() }),
          handler: async ({ dayId }) => {
            const ok = store.selectDay(dayId);
            return ok
              ? { ok: true }
              : { ok: false, error: `No day with id "${dayId}".` };
          },
        });
      },
    }),
  );
}
