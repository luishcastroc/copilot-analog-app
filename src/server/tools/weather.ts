// Real weather via Open-Meteo (free, no API key): geocode the place name,
// then fetch the daily forecast. Returns a compact JSON the frontend's
// weather card renders from `toolCall.result`.
import { defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";

/** Human-readable label for an Open-Meteo WMO weather code. */
const describeWeatherCode = (code: number): string => {
  if (code === 0) return "Clear sky";
  if (code <= 2) return "Mostly clear";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorm";
};

export const getWeather = defineTool({
  name: "get_weather",
  description:
    "Get the real weather forecast for a location. Ensure the location is fully spelled out (city and country).",
  parameters: z.object({
    location: z.string().describe("City to look up, e.g. 'Mérida, Mexico'"),
    date: z
      .string()
      .optional()
      .describe(
        "Day to forecast as YYYY-MM-DD (within ~15 days). Omit for today.",
      ),
  }),
  execute: async ({ location, date }) => {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(location)}`,
    );
    const geo = (await geoRes.json()) as {
      results?: {
        name: string;
        country?: string;
        latitude: number;
        longitude: number;
      }[];
    };
    const place = geo.results?.[0];
    if (!place) {
      return { error: `Could not find a place named "${location}".` };
    }
    const params = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
      timezone: "auto",
    });
    // Sanitize the model-provided date: the forecast API 400s on malformed
    // dates and only covers ~15 days ahead. Past/invalid dates fall back to
    // today; too-far dates get an honest explanation instead of an error.
    const today = new Date().toISOString().slice(0, 10);
    let day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? (date as string) : "";
    if (day && day < today) day = "";
    if (day) {
      const daysAhead = Math.round(
        (Date.parse(day) - Date.parse(today)) / 86_400_000,
      );
      if (daysAhead > 15) {
        return {
          error: `The forecast only covers about 15 days ahead, and ${day} is ${daysAhead} days out. Tell the user to check again closer to the trip.`,
        };
      }
      params.set("start_date", day);
      params.set("end_date", day);
    } else {
      params.set("forecast_days", "1");
    }
    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`,
    );
    if (!wxRes.ok) {
      const reason = (await wxRes.json().catch(() => null)) as {
        reason?: string;
      } | null;
      return {
        error: `Forecast lookup failed (${wxRes.status}${reason?.reason ? `: ${reason.reason}` : ""}).`,
      };
    }
    const wx = (await wxRes.json()) as {
      daily?: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: (number | null)[];
        wind_speed_10m_max: number[];
      };
    };
    const d = wx.daily;
    if (!d?.time?.length) {
      return { error: `No forecast available for ${location} on ${date}.` };
    }
    return {
      location: [place.name, place.country].filter(Boolean).join(", "),
      date: d.time[0],
      description: describeWeatherCode(d.weather_code[0]),
      weatherCode: d.weather_code[0],
      maxC: Math.round(d.temperature_2m_max[0]),
      minC: Math.round(d.temperature_2m_min[0]),
      precipChancePct: d.precipitation_probability_max[0] ?? null,
      windKmh: Math.round(d.wind_speed_10m_max[0]),
    };
  },
});
