import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import { LucideAngularModule, Umbrella, Wind } from "lucide-angular";
import { iconForCode } from "../../util/weather-icons";
import { z } from "zod";
import type { AngularToolCall, ToolRenderer } from "@copilotkit/angular";

export const weatherArgs = z.object({
  location: z.string(),
  date: z.string().optional(),
});
type WeatherArgs = z.infer<typeof weatherArgs>;

interface WeatherResult {
  location?: string;
  date?: string;
  description?: string;
  weatherCode?: number;
  maxC?: number;
  minC?: number;
  precipChancePct?: number | null;
  windKmh?: number;
  error?: string;
}


@Component({
  selector: "app-weather-card",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <div class="wx" [class.wx--pending]="pending()">
      <header class="wx__head">
        <div>
          <p class="wx__eyebrow">{{ labels.eyebrow }}</p>
          <h3 class="wx__place">{{ place() }}</h3>
          @if (data()?.date) {
            <p class="wx__date">{{ data()?.date }}</p>
          }
        </div>
        <lucide-angular class="wx__icon" [img]="icon()" [size]="40" />
      </header>

      @if (pending()) {
        <p class="wx__pending">{{ labels.pending }}</p>
      } @else if (data()?.error) {
        <p class="wx__error">{{ data()?.error }}</p>
      } @else {
        <div class="wx__main">
          <span class="wx__temp">{{ data()?.maxC }}°</span>
          <div class="wx__desc">
            <span>{{ data()?.description }}</span>
            <span class="wx__range">{{ lowLabel() }}</span>
          </div>
        </div>
        <dl class="wx__facts">
          <div>
            <dt>
              <lucide-angular [img]="WindIcon" [size]="14" />
              {{ labels.wind }}
            </dt>
            <dd>{{ data()?.windKmh }} km/h</dd>
          </div>
          @if (data()?.precipChancePct !== null) {
            <div>
              <dt>
                <lucide-angular [img]="RainIcon" [size]="14" />
                {{ labels.rain }}
              </dt>
              <dd>{{ data()?.precipChancePct }}%</dd>
            </div>
          }
        </dl>
      }
    </div>
  `,
  styles: [
    `
      .wx {
        margin: 1rem 0;
        max-width: 26rem;
        border-radius: 14px;
        padding: 1.1rem 1.25rem 1.15rem;
        color: #f4f6f2;
        background:
          linear-gradient(160deg, rgba(255, 255, 255, 0.08), transparent 45%),
          var(--app-theme-color, #0e8c8c);
        box-shadow: 0 14px 30px rgba(30, 40, 31, 0.22);
      }
      .wx__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .wx__eyebrow {
        margin: 0;
        font-size: 0.68rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        opacity: 0.75;
      }
      .wx__place {
        margin: 0.1rem 0 0;
        font-family: var(--font-display, inherit);
        font-size: 1.2rem;
        font-weight: 700;
        line-height: 1.2;
      }
      .wx__date {
        margin: 0.15rem 0 0;
        font-size: 0.78rem;
        opacity: 0.75;
        font-variant-numeric: tabular-nums;
      }
      .wx__icon {
        flex: none;
        opacity: 0.95;
      }
      .wx__pending {
        margin: 1rem 0 0.25rem;
        font-style: italic;
        opacity: 0.85;
      }
      .wx__error {
        margin: 1rem 0 0.25rem;
        font-size: 0.9rem;
      }
      .wx__main {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
        margin-top: 0.9rem;
      }
      .wx__temp {
        font-family: var(--font-display, inherit);
        font-size: 2.6rem;
        font-weight: 800;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .wx__desc {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        font-size: 0.9rem;
      }
      .wx__range {
        opacity: 0.75;
        font-size: 0.78rem;
      }
      .wx__facts {
        display: flex;
        gap: 1.5rem;
        margin: 1rem 0 0;
        padding-top: 0.8rem;
        border-top: 1px solid rgba(244, 246, 242, 0.25);
      }
      .wx__facts div {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .wx__facts dt {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.75;
      }
      .wx__facts dd {
        margin: 0;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class WeatherCard implements ToolRenderer<WeatherArgs> {
  readonly toolCall = input.required<AngularToolCall<WeatherArgs>>();

  protected readonly WindIcon = Wind;
  protected readonly RainIcon = Umbrella;

  protected readonly labels = {
    eyebrow: $localize`:@@wx.eyebrow:Forecast`,
    pending: $localize`:@@wx.pending:Reading the sky…`,
    wind: $localize`:@@wx.wind:Wind`,
    rain: $localize`:@@wx.rain:Rain`,
  };

  protected readonly lowLabel = computed(
    () => $localize`:@@wx.low:low ${this.data()?.minC ?? ""}:min:°C`,
  );

  protected readonly pending = computed(
    () => this.toolCall().status !== "complete",
  );

  // result is the tool's return value, JSON-serialized by the runtime.
  protected readonly data = computed<WeatherResult | undefined>(() => {
    const call = this.toolCall();
    if (call.status !== "complete") return undefined;
    try {
      return JSON.parse(call.result) as WeatherResult;
    } catch {
      return { error: "Could not read the forecast." };
    }
  });

  protected readonly place = computed(
    () => this.data()?.location ?? this.toolCall().args?.location ?? "Weather",
  );

  protected readonly icon = computed(() => iconForCode(this.data()?.weatherCode));
}
