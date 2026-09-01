import { Component, computed, inject, input } from "@angular/core";
import { injectChatConfiguration } from "@copilotkit/angular";
import { TripBoard } from "./trip-board";
import { currentLocale, setLocale } from "../../i18n";
import { TripStore } from "../application/trip.store";

@Component({
  selector: "app-main-content",
  standalone: true,
  imports: [TripBoard],
  template: `
    <div class="page">
      <div class="page__inner">
        <header class="masthead">
          <div class="masthead__top">
            <p class="masthead__eyebrow">{{ labels.eyebrow }}</p>
            <button
              type="button"
              class="masthead__lang"
              (click)="switchLanguage()"
              [attr.aria-label]="labels.langAria"
            >
              {{ labels.langToggle }}
            </button>
          </div>
          <h1 class="masthead__title">{{ tripName() }}</h1>
          <p class="masthead__meta">{{ meta() }}</p>
        </header>
        <app-trip-board />
      </div>
    </div>
  `,
  styles: [
    `
      .page {
        height: 100%;
        overflow: auto;
        background:
          radial-gradient(
            60rem 30rem at 85% -10%,
            color-mix(in srgb, var(--cenote) 9%, transparent),
            transparent 60%
          ),
          var(--limestone);
        color: var(--ink);
      }
      .page__inner {
        max-width: 44rem;
        margin: 0 auto;
        padding: 3.5rem 2rem 5rem;
      }
      .masthead {
        margin-bottom: 2.25rem;
      }
      .masthead__top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      .masthead__eyebrow {
        margin: 0;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--cenote);
      }
      .masthead__lang {
        border: 1px solid var(--stone);
        background: var(--paper);
        color: var(--ink-soft);
        font: inherit;
        font-size: 0.75rem;
        font-weight: 600;
        border-radius: 999px;
        padding: 0.25rem 0.75rem;
        cursor: pointer;
      }
      .masthead__lang:hover {
        border-color: var(--cenote);
        color: var(--cenote);
      }
      .masthead__title {
        margin: 0.4rem 0 0;
        font-family: var(--font-display);
        font-size: clamp(1.9rem, 4.5vw, 2.8rem);
        font-weight: 800;
        line-height: 1.08;
        letter-spacing: -0.015em;
      }
      .masthead__meta {
        margin: 0.6rem 0 0;
        color: var(--ink-soft);
        font-size: 0.92rem;
      }
      @media (max-width: 600px) {
        .page__inner {
          padding: 2.25rem 1.25rem 4rem;
        }
      }
    `,
  ],
})
export class MainContent {
  /** Accent color, driven by the agent's setThemeColor frontend tool. */
  readonly themeColor = input<string>("#0e8c8c");

  readonly #store = inject(TripStore);

  protected readonly labels = {
    eyebrow: $localize`:@@masthead.eyebrow:Sacbé · trip planner`,
    langToggle: $localize`:@@lang.toggle:Español`,
    langAria: $localize`:@@lang.toggleAria:Cambiar a español`,
  };

  protected readonly tripName = computed(
    () =>
      this.#store.tripName() ||
      $localize`:@@masthead.defaultTripName:Name this trip`,
  );
  protected readonly dayCount = this.#store.dayCount;
  protected readonly stopCount = this.#store.totalStops;

  protected readonly meta = computed(() => {
    const s = this.stopCount();
    const d = this.dayCount();
    const stops =
      s === 1
        ? $localize`:@@unit.stop.one:1 stop`
        : $localize`:@@unit.stop.many:${s}:n: stops`;
    const days =
      d === 1
        ? $localize`:@@unit.day.one:1 day`
        : $localize`:@@unit.day.many:${d}:n: days`;
    return $localize`:@@masthead.meta:${stops}:stops: across ${days}:days: — planned with the assistant, yours to reroute.`;
  });

  readonly #chatConfig = injectChatConfiguration();

  protected switchLanguage(): void {
    // Hand the active thread to the reload so the conversation survives the
    // language switch (existing messages keep their language; only the
    // static UI translates).
    setLocale(
      currentLocale() === "es" ? "en" : "es",
      this.#chatConfig.threadId(),
    );
  }
}
