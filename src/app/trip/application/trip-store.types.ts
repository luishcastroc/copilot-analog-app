import type { Signal } from "@angular/core";
import type { TripDay, TripEntry, TripState } from "../domain/trip.models";

export type UpsertDayInput = Partial<TripDay> & { label: string };
export type UpsertStopInput = Partial<TripEntry> & { title: string };

export type TripStateSlice = Pick<
  TripState,
  "tripName" | "days" | "selectedDayId"
>;

export interface TripDerivedSignals {
  selectedDay: Signal<TripDay | undefined>;
  dayCount: Signal<number>;
  totalStops: Signal<number>;
}

/**
 * Declared as a `type`, not an `interface`, so it keeps an implicit index
 * signature and stays assignable to NgRx's `MethodsDictionary` when used as
 * a `signalStoreFeature` input (same trick as the reference architecture).
 */
export type TripMethods = {
  setTripName(name: string): void;
  selectDay(dayId: string): boolean;
  upsertDay(input: UpsertDayInput): TripDay;
  upsertStop(dayId: string, input: UpsertStopInput): TripEntry | undefined;
  removeStop(dayId: string, stopId: string): boolean;
  removeDay(dayId: string): boolean;
  clearTrip(): void;
};
