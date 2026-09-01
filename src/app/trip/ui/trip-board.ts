import { Component, inject, signal } from "@angular/core";
import {
  BedDouble,
  Bus,
  Landmark,
  LucideAngularModule,
  MapPin,
  UtensilsCrossed,
  Waves,
  X,
} from "lucide-angular";
import { TripStore } from "../application/trip.store";
import type { EntryCategory, TripDay, TripEntry } from "../domain/trip.models";
import { WeatherHint } from "./weather-hint";
import { StopDetail } from "./stop-detail";

const CATEGORY_ICONS = {
  food: UtensilsCrossed,
  sight: Landmark,
  nature: Waves,
  stay: BedDouble,
  travel: Bus,
  other: MapPin,
} as const;

@Component({
  selector: "app-trip-board",
  standalone: true,
  imports: [LucideAngularModule, WeatherHint, StopDetail],
  template: `
    <!-- Day tabs -->
    @if (store.days().length > 0) {
      <nav class="days" [attr.aria-label]="labels.daysAria">
        @for (day of store.days(); track day.id) {
          <button
            type="button"
            class="day"
            [class.day--active]="day.id === store.selectedDay()?.id"
            (click)="store.selectDay(day.id)"
          >
            {{ day.label }}
          </button>
        }
      </nav>
    }

    <!-- The sacbé: a road of stops -->
    @if (store.selectedDay(); as day) {
      <ol class="road" [attr.aria-label]="day.label">
        @for (entry of day.entries; track entry.id) {
          <li class="stop">
            <span class="stop__time">{{ entry.time ?? "—" }}</span>
            <span class="stop__stone" aria-hidden="true"></span>
            <!-- role=button div (not <button>): the card contains the remove
                 button, and buttons cannot nest. -->
            <div
              class="stop__card"
              role="button"
              tabindex="0"
              [attr.aria-label]="detailsLabel(entry.title)"
              (click)="openDetail(day, entry)"
              (keydown.enter)="openDetail(day, entry)"
              (keydown.space)="openDetail(day, entry); $event.preventDefault()"
            >
              <div class="stop__head">
                <lucide-angular
                  class="stop__glyph"
                  [img]="iconFor(entry.category)"
                  [size]="16"
                />
                <h3 class="stop__title">{{ entry.title }}</h3>
                <button
                  type="button"
                  class="stop__remove"
                  (click)="
                    store.removeStop(day.id, entry.id);
                    $event.stopPropagation()
                  "
                  [attr.aria-label]="removeLabel(entry.title)"
                >
                  <lucide-angular [img]="RemoveIcon" [size]="14" />
                </button>
              </div>
              @if (entry.note) {
                <p class="stop__note">{{ entry.note }}</p>
              }
              <app-weather-hint
                class="stop__wx"
                [location]="day.location"
                [date]="day.date"
                [time]="entry.time"
              />
            </div>
          </li>
        }
        @if (day.entries.length === 0) {
          <li class="road__empty">{{ labels.dayEmpty }}</li>
        }
      </ol>
    } @else {
      <div class="board-empty">
        <p class="board-empty__title">{{ labels.emptyTitle }}</p>
        <p class="board-empty__hint">{{ labels.emptyHint }}</p>
      </div>
    }

    @if (detail(); as d) {
      <app-stop-detail
        [entry]="d.entry"
        [day]="d.day"
        (closed)="detail.set(null)"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .days {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 1.75rem;
      }
      .day {
        border: 1px solid var(--stone);
        background: var(--paper);
        color: var(--ink);
        font: inherit;
        font-size: 0.85rem;
        font-weight: 600;
        border-radius: 999px;
        padding: 0.4rem 1rem;
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease;
      }
      .day:hover {
        border-color: var(--cenote);
      }
      .day--active {
        background: var(--ink);
        border-color: var(--ink);
        color: var(--paper);
      }

      /* ——— The sacbé road ——— */
      .road {
        list-style: none;
        margin: 0;
        padding: 0.25rem 0 0.5rem;
        position: relative;
      }
      .road::before {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: calc(var(--time-col) + 0.5rem + 7px);
        width: 6px;
        border-radius: 3px;
        background: #fff;
        box-shadow: inset 0 0 0 1px var(--stone);
      }
      .stop {
        --time-col: 3.5rem;
        display: grid;
        grid-template-columns: var(--time-col) 1.5rem minmax(0, 1fr);
        gap: 0 0.75rem;
        align-items: start;
        padding: 0.55rem 0;
        animation: rise 0.35s ease both;
      }
      .road__empty {
        margin-left: calc(var(--time-col, 3.5rem) + 2.25rem);
        padding: 1rem 0;
        font-style: italic;
        color: var(--ink-soft);
      }
      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .stop {
          animation: none;
        }
      }
      .stop__time {
        text-align: right;
        font-size: 0.78rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--ink-soft);
        padding-top: 0.55rem;
      }
      .stop__stone {
        width: 12px;
        height: 12px;
        margin: 0.6rem auto 0;
        background: var(--sun);
        border: 2px solid var(--paper);
        box-shadow: 0 0 0 1px var(--stone);
        transform: rotate(45deg);
        z-index: 1;
      }
      .stop__card {
        background: var(--paper);
        border: 1px solid var(--stone);
        border-radius: 12px;
        padding: 0.7rem 0.9rem;
        transition: border-color 0.15s ease;
        cursor: pointer;
      }
      .stop__card:hover {
        border-color: var(--cenote);
      }
      .stop__head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .stop__glyph {
        flex: none;
        color: var(--cenote);
      }
      .stop__title {
        margin: 0;
        font-family: var(--font-display);
        font-size: 1rem;
        font-weight: 700;
        flex: 1;
        min-width: 0;
      }
      .stop__remove {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--ink-soft);
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .stop__card:hover .stop__remove,
      .stop__remove:focus-visible {
        opacity: 1;
      }
      .stop__remove:hover {
        background: rgba(180, 69, 60, 0.12);
        color: var(--danger);
      }
      .stop__note {
        margin: 0.35rem 0 0;
        padding-left: 1.5rem;
        font-size: 0.85rem;
        color: var(--ink-soft);
      }
      .stop__wx {
        display: block;
        margin-top: 0.35rem;
        padding-left: 1.5rem;
      }
      .stop__wx:empty {
        display: none;
      }

      .board-empty {
        padding: 3rem 0;
        text-align: center;
      }
      .board-empty__title {
        margin: 0;
        font-family: var(--font-display);
        font-size: 1.4rem;
        font-weight: 700;
      }
      .board-empty__hint {
        margin: 0.4rem 0 0;
        color: var(--ink-soft);
      }
    `,
  ],
})
export class TripBoard {
  protected readonly store = inject(TripStore);
  protected readonly RemoveIcon = X;
  protected readonly detail = signal<{ day: TripDay; entry: TripEntry } | null>(
    null,
  );

  protected readonly labels = {
    daysAria: $localize`:@@board.days.aria:Trip days`,
    dayEmpty: $localize`:@@board.day.empty:This day is an open road. Ask the assistant to fill it.`,
    emptyTitle: $localize`:@@board.empty.title:The road is empty.`,
    emptyHint: $localize`:@@board.empty.hint:Ask the assistant to plan a day — try “Plan a day in Mérida”.`,
  };

  protected removeLabel(title: string): string {
    return $localize`:@@board.remove:Remove ${title}:title:`;
  }

  protected detailsLabel(title: string): string {
    return $localize`:@@board.details:Details for ${title}:title:`;
  }

  protected iconFor(category: EntryCategory | undefined) {
    return CATEGORY_ICONS[category ?? "other"] ?? MapPin;
  }

  protected openDetail(day: TripDay, entry: TripEntry): void {
    this.detail.set({ day, entry });
  }
}
