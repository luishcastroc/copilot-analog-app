import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import {
  Camera,
  ExternalLink,
  LucideAngularModule,
  MapPin,
  UtensilsCrossed,
  X,
} from "lucide-angular";
import { WeatherHint } from "./weather-hint";
import {
  PlaceInfoService,
  type WikiSummary,
} from "../../services/place-info.service";
import type { TripDay, TripEntry } from "../domain/trip.models";

/**
 * Detail overlay for one stop: the note, Wikipedia context (summary + photo)
 * when available, the hour's weather, and link-outs — Google Maps always,
 * menu search for food stops, photo search otherwise. All keyless: Wikipedia
 * API + Google's public URL schemes.
 */
@Component({
  selector: "app-stop-detail",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, WeatherHint],
  host: { "(document:keydown.escape)": "closed.emit()" },
  template: `
    <div class="sd" (click)="onBackdrop($event)">
      <div
        class="sd__panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="entry().title"
      >
        <button
          type="button"
          class="sd__close"
          (click)="closed.emit()"
          [attr.aria-label]="labels.close"
        >
          <lucide-angular [img]="CloseIcon" [size]="18" />
        </button>

        @if (wiki()?.thumbnail; as thumb) {
          <img class="sd__photo" [src]="thumb" [alt]="entry().title" />
        }

        <div class="sd__body">
          <p class="sd__eyebrow">
            {{ entry().time ?? labels.anytime }} · {{ day().label }}
          </p>
          <h2 class="sd__title">{{ entry().title }}</h2>
          @if (entry().address) {
            <p class="sd__address">
              <lucide-angular [img]="MapIcon" [size]="12" />
              {{ entry().address }}
            </p>
          }
          @if (entry().note) {
            <p class="sd__note">{{ entry().note }}</p>
          }
          <app-weather-hint
            class="sd__wx"
            [location]="day().location"
            [date]="day().date"
            [time]="entry().time"
          />

          @if (pending()) {
            <p class="sd__loading">{{ labels.pending }}</p>
          } @else if (wiki(); as w) {
            <p class="sd__extract">{{ w.extract }}</p>
            @if (w.url) {
              <a
                class="sd__source"
                [href]="w.url"
                target="_blank"
                rel="noopener noreferrer"
                >{{ wikipediaLabel() }}
                <lucide-angular [img]="ExtIcon" [size]="11" />
              </a>
            }
          }

          <div class="sd__actions">
            <a
              class="sd__action"
              [href]="mapsUrl()"
              target="_blank"
              rel="noopener noreferrer"
            >
              <lucide-angular [img]="MapIcon" [size]="15" />
              {{ labels.maps }}
            </a>
            @if (entry().category === "food") {
              <a
                class="sd__action"
                [href]="menuUrl()"
                target="_blank"
                rel="noopener noreferrer"
              >
                <lucide-angular [img]="MenuIcon" [size]="15" />
                {{ labels.menu }}
              </a>
            } @else {
              <a
                class="sd__action"
                [href]="photosUrl()"
                target="_blank"
                rel="noopener noreferrer"
              >
                <lucide-angular [img]="PhotoIcon" [size]="15" />
                {{ labels.photos }}
              </a>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .sd {
        position: fixed;
        inset: 0;
        z-index: 1300;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: rgba(32, 40, 31, 0.45);
        animation: sd-fade 0.18s ease;
      }
      @keyframes sd-fade {
        from {
          opacity: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .sd {
          animation: none;
        }
      }
      .sd__panel {
        position: relative;
        width: min(30rem, 100%);
        max-height: min(85dvh, 40rem);
        overflow: auto;
        border-radius: 16px;
        background: var(--paper, #fbfaf6);
        color: var(--ink, #20281f);
        box-shadow: 0 24px 60px rgba(30, 40, 31, 0.35);
      }
      .sd__close {
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border: 0;
        border-radius: 999px;
        background: var(--paper, #fbfaf6);
        color: var(--ink, #20281f);
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(30, 40, 31, 0.2);
      }
      .sd__photo {
        width: 100%;
        max-height: 14rem;
        object-fit: cover;
        display: block;
      }
      .sd__body {
        padding: 1.15rem 1.35rem 1.35rem;
      }
      .sd__eyebrow {
        margin: 0;
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--cenote, #0e8c8c);
        font-variant-numeric: tabular-nums;
      }
      .sd__title {
        margin: 0.3rem 0 0;
        font-family: var(--font-display, inherit);
        font-size: 1.45rem;
        font-weight: 800;
        line-height: 1.15;
      }
      .sd__address {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        margin: 0.4rem 0 0;
        font-size: 0.82rem;
        color: var(--ink-soft, #6b7265);
      }
      .sd__address lucide-angular {
        color: var(--cenote, #0e8c8c);
        display: inline-flex;
      }
      .sd__note {
        margin: 0.5rem 0 0;
        color: var(--ink-soft, #6b7265);
      }
      .sd__wx {
        display: block;
        margin-top: 0.5rem;
      }
      .sd__loading {
        margin: 0.9rem 0 0;
        font-style: italic;
        color: var(--ink-soft, #6b7265);
        font-size: 0.9rem;
      }
      .sd__extract {
        margin: 0.9rem 0 0;
        font-size: 0.92rem;
        line-height: 1.55;
      }
      .sd__source {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        margin-top: 0.35rem;
        font-size: 0.75rem;
        color: var(--ink-soft, #6b7265);
        text-decoration: none;
      }
      .sd__source:hover {
        color: var(--cenote, #0e8c8c);
      }
      .sd__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 1.1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--stone, #d9d7cb);
      }
      .sd__action {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.45rem 0.95rem;
        border: 1px solid var(--stone, #d9d7cb);
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--ink, #20281f);
        text-decoration: none;
      }
      .sd__action:hover {
        border-color: var(--cenote, #0e8c8c);
        color: var(--cenote, #0e8c8c);
      }
    `,
  ],
})
export class StopDetail {
  readonly entry = input.required<TripEntry>();
  readonly day = input.required<TripDay>();
  readonly closed = output<void>();

  protected readonly CloseIcon = X;
  protected readonly MapIcon = MapPin;
  protected readonly MenuIcon = UtensilsCrossed;
  protected readonly PhotoIcon = Camera;
  protected readonly ExtIcon = ExternalLink;

  readonly #svc = inject(PlaceInfoService);
  protected readonly pending = signal(true);
  protected readonly wiki = signal<WikiSummary | null>(null);

  constructor() {
    effect(() => {
      const entry = this.entry();
      const location = this.day().location;
      this.pending.set(true);
      this.wiki.set(null);
      this.#svc.lookup(entry.title, location).then((summary) => {
        if (this.entry() === entry) {
          this.wiki.set(summary);
          this.pending.set(false);
        }
      });
    });
  }

  protected readonly labels = {
    close: $localize`:@@detail.close:Close details`,
    anytime: $localize`:@@detail.anytime:anytime`,
    pending: $localize`:@@detail.pending:Looking this place up…`,
    maps: $localize`:@@detail.maps:Open in Google Maps`,
    menu: $localize`:@@detail.menu:Find the menu`,
    photos: $localize`:@@detail.photos:More photos`,
  };

  protected readonly wikipediaLabel = computed(
    () =>
      $localize`:@@detail.wikipedia:From Wikipedia: ${this.wiki()?.title ?? ""}:title:`,
  );

  // Include the entry's address so chains resolve to the exact branch being
  // recommended, not whichever location Maps ranks first.
  readonly #place = computed(() =>
    [this.entry().title, this.entry().address, this.day().location]
      .filter(Boolean)
      .join(", "),
  );

  protected readonly mapsUrl = computed(
    () =>
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(this.#place())}`,
  );
  protected readonly menuUrl = computed(
    () =>
      `https://www.google.com/search?q=${encodeURIComponent(`${this.#place()} menu`)}`,
  );
  protected readonly photosUrl = computed(
    () =>
      `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(this.#place())}`,
  );

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }
}
