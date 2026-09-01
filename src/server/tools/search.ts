// Scoped web search via Tavily (free tier). NOT an open search box: the
// agent must name a place and pick a topic, the server composes the query,
// and results are capped at 5 basic-depth hits (1 credit per call).
// Degrades gracefully when TAVILY_API_KEY is unset.
import { defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";

export const searchWeb = defineTool({
  name: "search_web",
  description:
    "Look up CURRENT trip facts about a specific place: restaurants (incl. Michelin), activities and tours, sights, events, or practical info (hours, prices, closures). Not a general-purpose search.",
  parameters: z.object({
    place: z
      .string()
      .describe("The destination this is about, e.g. 'Mérida, Yucatán'"),
    topic: z
      .enum(["restaurants", "activities", "sights", "events", "practical"])
      .describe(
        "What kind of trip fact is needed (activities = tours, excursions, things to do)",
      ),
    query: z
      .string()
      .describe(
        "The specific thing to find, e.g. 'Michelin Guide 2025 selections'",
      ),
  }),
  execute: async ({ place, topic, query }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return {
        error:
          "Web search is not configured (TAVILY_API_KEY is unset). Tell the user, and answer from general knowledge with a clear 'may be outdated' caveat.",
      };
    }
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `${query} — ${topic} in ${place}`,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      }),
    });
    if (!res.ok) {
      return { error: `Search failed (${res.status}).` };
    }
    const data = (await res.json()) as {
      answer?: string;
      results?: { title: string; url: string; content: string }[];
    };
    return {
      place,
      topic,
      answer: data.answer ?? null,
      sources: (data.results ?? []).slice(0, 5).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, 240),
      })),
    };
  },
});
