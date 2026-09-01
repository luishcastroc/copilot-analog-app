import type { EntryCategory, TripDay, TripEntry } from "./trip.models";

const CATEGORIES: EntryCategory[] = [
  "food",
  "sight",
  "nature",
  "stay",
  "travel",
  "other",
];

/** kebab-case a title into a stable, url-safe id; suffix keeps them unique. */
function slug(text: string, taken: Set<string>): string {
  const base =
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "item";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}-${n++}`;
  return candidate;
}

export function createEntry(
  input: Partial<TripEntry> & { title: string },
  existing: TripEntry[],
): TripEntry {
  const taken = new Set(existing.map((e) => e.id));
  return {
    id:
      input.id && !taken.has(input.id) ? input.id : slug(input.title, taken),
    title: input.title,
    time: input.time || undefined,
    note: input.note || undefined,
    address: input.address || undefined,
    category: CATEGORIES.includes(input.category as EntryCategory)
      ? input.category
      : "other",
  };
}

export function createDay(
  input: Partial<TripDay> & { label: string },
  existing: TripDay[],
): TripDay {
  const taken = new Set(existing.map((d) => d.id));
  return {
    id: input.id && !taken.has(input.id) ? input.id : slug(input.label, taken),
    label: input.label,
    date: /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "") ? input.date : undefined,
    location: input.location || undefined,
    entries: [],
  };
}
