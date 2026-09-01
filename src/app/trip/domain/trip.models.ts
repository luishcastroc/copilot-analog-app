/** Pure domain model: the trip the human and the agent co-edit. */

export type EntryCategory =
  | "food"
  | "sight"
  | "nature"
  | "stay"
  | "travel"
  | "other";

export interface TripEntry {
  id: string;
  /** Free-form time label, e.g. "09:30" or "sunset". */
  time?: string;
  title: string;
  note?: string;
  /**
   * Street address or unambiguous landmark for THIS specific branch/spot —
   * chains have many locations, and the Maps link must hit the right one.
   */
  address?: string;
  category?: EntryCategory;
}

export interface TripDay {
  id: string;
  /** e.g. "Day 1 · Mérida" */
  label: string;
  /** Calendar date as YYYY-MM-DD — enables per-stop weather hints. */
  date?: string;
  /** Where this day happens, e.g. "Mérida, Mexico" — for weather lookups. */
  location?: string;
  entries: TripEntry[];
}

export interface TripState {
  tripName: string;
  days: TripDay[];
  selectedDayId: string;
}

export const initialTripState: TripState = {
  tripName: "",
  days: [],
  selectedDayId: "",
};

export function stopCount(days: TripDay[]): number {
  return days.reduce((sum, day) => sum + day.entries.length, 0);
}
