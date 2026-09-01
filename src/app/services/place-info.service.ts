import { Injectable } from "@angular/core";

export interface WikiSummary {
  title: string;
  extract: string;
  thumbnail?: string;
  url?: string;
}

/**
 * Place context from Wikipedia's public API (free, no key, CORS-enabled):
 * search for the best-matching article, then fetch its summary + thumbnail.
 * Cached per query; resolves null when nothing sensible matches.
 */
@Injectable({ providedIn: "root" })
export class PlaceInfoService {
  readonly #cache = new Map<string, Promise<WikiSummary | null>>();

  lookup(title: string, location: string | undefined) {
    const query = [title, location].filter(Boolean).join(" ");
    let hit = this.#cache.get(query);
    if (!hit) {
      // Location narrows ambiguous titles but can kill recall for specific
      // ones ("Cenote Xlacah Mérida, Mexico" → 0 hits) — retry bare title.
      const accept = `${title} ${location ?? ""}`;
      hit = this.#fetch(query, accept)
        .then((found) => found ?? (location ? this.#fetch(title, accept) : null))
        .catch(() => null);
      this.#cache.set(query, hit);
    }
    return hit;
  }

  async #fetch(query: string, acceptTerms: string): Promise<WikiSummary | null> {
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=${encodeURIComponent(query)}`,
    );
    const search = (await searchRes.json()) as {
      query?: { search?: { title: string }[] };
    };
    const page = search.query?.search?.[0]?.title;
    if (!page) return null;
    // Relevance gate: search can top-hit a merely *related* page (e.g.
    // "Cenote Xlacah" → the explorer who dove it). Only accept a hit whose
    // title shares a significant word with the stop title or its location —
    // wrong-entity context is worse than none.
    const fold = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
    const pageWords = new Set(fold(page).split(/[^a-z0-9]+/));
    const relevant = fold(acceptTerms)
      .split(/[^a-z0-9]+/)
      .some((w) => w.length >= 4 && pageWords.has(w));
    if (!relevant) return null;
    const sumRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`,
    );
    if (!sumRes.ok) return null;
    const sum = (await sumRes.json()) as {
      title?: string;
      extract?: string;
      thumbnail?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
    };
    if (!sum.extract) return null;
    return {
      title: sum.title ?? page,
      extract: sum.extract,
      thumbnail: sum.thumbnail?.source,
      url: sum.content_urls?.desktop?.page,
    };
  }
}
