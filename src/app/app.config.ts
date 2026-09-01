import type { ApplicationConfig } from "@angular/core";
import { provideZonelessChangeDetection } from "@angular/core";
import {
  provideCopilotChatConfiguration,
  provideCopilotChatLabels,
  provideCopilotKit,
} from "@copilotkit/angular";
import { WeatherCard, weatherArgs } from "./trip/ui/weather-card";
import { ClearTripCard, clearTripArgs } from "./trip/ui/clear-trip-card";
import { SearchCard, searchArgs } from "./trip/ui/search-card";
import { AGENT_ID } from "./constants";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideCopilotKit({
      // Served same-origin by the Analog/Nitro server route
      // (src/server/routes/api/copilotkit/[...].ts).
      runtimeUrl: "/api/copilotkit",
      // 🪁 Generative UI: render a live forecast card whenever the agent
      // calls the server-side `get_weather` tool.
      renderToolCalls: [
        { name: "get_weather", args: weatherArgs, component: WeatherCard },
        { name: "search_web", args: searchArgs, component: SearchCard },
      ],
      // 🪁 Human in the loop: the agent PROPOSES destructive changes; the
      // run pauses on this frontend tool until the human approves/declines
      // in the ClearTripCard, whose respond() becomes the tool result.
      humanInTheLoop: [
        {
          name: "clear_trip",
          description:
            "Propose clearing the whole trip or removing one day. The user approves or declines in the interface; the result reports their decision.",
          parameters: clearTripArgs,
          component: ClearTripCard,
        },
      ],
      // 🪁 Suggestions: fixed starters before the first message, then
      // AI-generated follow-ups grounded in the current trip state.
      suggestionsConfig: [
        {
          available: "before-first-message",
          suggestions: [
            {
              title: $localize`:@@sug.plan.title:Plan a day`,
              message: $localize`:@@sug.plan.msg:Plan a full day in Mérida.`,
            },
            {
              title: $localize`:@@sug.cenote.title:Add a cenote`,
              message: $localize`:@@sug.cenote.msg:Add a cenote swim to the afternoon.`,
            },
            {
              title: $localize`:@@sug.weather.title:Check the weather`,
              message: $localize`:@@sug.weather.msg:What's the weather for day 1?`,
            },
            {
              title: $localize`:@@sug.reset.title:Start over`,
              message: $localize`:@@sug.reset.msg:Clear the whole trip.`,
            },
          ],
        },
        {
          available: "after-first-message",
          instructions:
            "Suggest 2-3 short next actions for planning this trip, grounded in the current trip state and written in the same language the user is chatting in: filling gaps in the selected day (mornings, meals, evenings), checking weather before outdoor stops, adding another day, or rebalancing an overpacked day. Phrase them as direct requests, max 6 words each.",
          minSuggestions: 2,
          maxSuggestions: 3,
        },
      ],
    }),
    // Owns the active thread the SDK threads drawer drives (the Angular analog
    // of React's CopilotChatConfigurationProvider). Uncontrolled, so the
    // drawer's "+ New" can reset to a fresh thread.
    //
    // Deliberately NOT seeded from the ?thread= deep link or the
    // language-switch stash: a remembered id can point at a thread the
    // platform has soft-deleted, whose id stays taken forever (GET 404s,
    // re-creating it 409s) — seeding it means every run in that session
    // fails. App restores a remembered thread only after verifying it in
    // the thread list; until then the session runs on a fresh, usable id.
    provideCopilotChatConfiguration({ agentId: AGENT_ID }),
    // Localized labels for the SDK chat UI.
    provideCopilotChatLabels({
      chatInputPlaceholder: $localize`:@@chatlbl.placeholder:Type a message…`,
      welcomeMessageText: $localize`:@@chatlbl.welcome:How can I help you today?`,
      chatDisclaimerText: $localize`:@@chatlbl.disclaimer:AI can make mistakes. Please verify important information.`,
    }),
  ],
};
