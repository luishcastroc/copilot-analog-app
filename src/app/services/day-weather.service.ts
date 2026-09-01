import { Injectable } from "@angular/core";

export interface HourWeather {
  code: number;
  tempC: number;
  precipPct: number;
}

/**
 * Hourly forecasts for trip days, fetched client-side from Open-Meteo (free,
 * no key) and cached per location+date. No agent involvement — weather hints
 * are ambient UI, not tokens.
 */
@Injectable({ providedIn: "root" })
export class DayWeatherService {
  readonly #cache = new Map<string, Promise<HourWeather[] | null>>();

  getHourly(location: string, date: string): Promise<HourWeather[] | null> {
    const key = `${location.toLowerCase()}|${date}`;
    let hit = this.#cache.get(key);
    if (!hit) {
      hit = this.#fetch(location, date).catch(() => null);
      this.#cache.set(key, hit);
    }
    return hit;
  }

  async #fetch(location: string, date: string): Promise<HourWeather[] | null> {
    // Only the API's ~15-day window is answerable; anything else stays quiet.
    const today = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return null;
    if ((Date.parse(date) - Date.parse(today)) / 86_400_000 > 15) return null;

    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(location)}`,
    );
    const geo = (await geoRes.json()) as {
      results?: { latitude: number; longitude: number }[];
    };
    const place = geo.results?.[0];
    if (!place) return null;

    const params = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      hourly: "weather_code,temperature_2m,precipitation_probability",
      start_date: date,
      end_date: date,
      timezone: "auto",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      hourly?: {
        weather_code: number[];
        temperature_2m: number[];
        precipitation_probability: (number | null)[];
      };
    };
    const h = data.hourly;
    if (!h?.weather_code?.length) return null;
    return h.weather_code.map((code, i) => ({
      code,
      tempC: Math.round(h.temperature_2m[i]),
      precipPct: h.precipitation_probability[i] ?? 0,
    }));
  }
}
