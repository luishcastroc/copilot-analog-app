import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { LucideAngularModule } from "lucide-angular";
import {
  DayWeatherService,
  type HourWeather,
} from "../../services/day-weather.service";
import { iconForCode } from "../../util/weather-icons";

/** "sunset" → 19, "09:30" → 9, "2pm" → 14; midday when unparseable. */
const hourFromTime = (time: string | undefined): number => {
  if (!time) return 12;
  const t = time.toLowerCase();
  if (t.includes("sunrise") || t.includes("dawn")) return 6;
  if (t.includes("sunset") || t.includes("dusk")) return 19;
  if (t.includes("night") || t.includes("evening")) return 20;
  if (t.includes("morning")) return 9;
  if (t.includes("afternoon")) return 15;
  const m = t.match(/(\d{1,2})/);
  if (!m) return 12;
  let hour = Math.min(23, parseInt(m[1], 10));
  if (t.includes("pm") && hour < 12) hour += 12;
  return hour;
};

const phraseFor = (w: HourWeather): string => {
  if (w.code >= 95)
    return $localize`:@@hint.storm:storms possible — keep plans flexible`;
  if (w.precipPct >= 50)
    return $localize`:@@hint.rain:rain likely — bring an umbrella`;
  if (w.precipPct >= 30)
    return $localize`:@@hint.shower:a shower could pass through`;
  if (w.tempC >= 33) return $localize`:@@hint.hot:hot — plan shade and water`;
  if (w.code === 0) return $localize`:@@hint.clear:clear skies`;
  return $localize`:@@hint.fine:looks fine`;
};

/**
 * Tiny ambient forecast for one stop: icon, temperature at that hour, and a
 * short phrase. Renders nothing when a forecast isn't answerable (no
 * location, date out of range, lookup failed) — silence over noise.
 */
@Component({
  selector: "app-weather-hint",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    @if (hint(); as h) {
      <span class="wh" [title]="location() + ' · ' + date()">
        <lucide-angular [img]="h.icon" [size]="13" />
        <span class="wh__temp">{{ h.tempC }}°</span>
        <span class="wh__phrase">{{ h.phrase }}</span>
      </span>
    }
  `,
  styles: [
    `
      .wh {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.75rem;
        color: var(--ink-soft, #6b7265);
      }
      .wh lucide-angular {
        color: var(--cenote, #0e8c8c);
        display: inline-flex;
      }
      .wh__temp {
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class WeatherHint {
  readonly location = input<string | undefined>();
  readonly date = input<string | undefined>();
  readonly time = input<string | undefined>();

  readonly #svc = inject(DayWeatherService);
  readonly #hours = signal<HourWeather[] | null>(null);

  constructor() {
    effect(() => {
      const location = this.location();
      const date = this.date();
      this.#hours.set(null);
      if (!location || !date) return;
      this.#svc.getHourly(location, date).then((hours) => {
        // Only apply if the inputs haven't changed while fetching.
        if (this.location() === location && this.date() === date) {
          this.#hours.set(hours);
        }
      });
    });
  }

  protected readonly hint = computed(() => {
    const hours = this.#hours();
    if (!hours) return undefined;
    const w = hours[hourFromTime(this.time())];
    if (!w) return undefined;
    return { icon: iconForCode(w.code), tempC: w.tempC, phrase: phraseFor(w) };
  });
}
