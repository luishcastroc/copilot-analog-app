import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import type {
  HumanInTheLoopToolCall,
  HumanInTheLoopToolRenderer,
} from "@copilotkit/angular";
import { z } from "zod";
import { TripStore } from "../application/trip.store";

export const clearTripArgs = z.object({
  scope: z.enum(["trip", "day"]).describe("What to clear"),
  dayId: z.string().optional().describe('Required when scope is "day"'),
  reason: z.string().describe("One sentence: why this is being proposed"),
});
type ClearTripArgs = z.infer<typeof clearTripArgs>;

/**
 * Human-in-the-loop renderer for the agent's `clear_trip` proposal. The run
 * pauses on the frontend tool call; Approve applies the change to shared
 * state and responds, Keep responds with a decline — either way the agent
 * continues with the human's verdict as the tool result.
 */
@Component({
  selector: "app-clear-trip-card",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ct" [class.ct--done]="decided()">
      <p class="ct__eyebrow">{{ labels.eyebrow }}</p>
      <p class="ct__what">{{ headline() }}</p>
      @if (reason()) {
        <p class="ct__why">{{ reason() }}</p>
      }
      @if (!decided()) {
        <div class="ct__actions">
          <button type="button" class="ct__btn ct__btn--danger" (click)="approve()">
            {{ approveLabel() }}
          </button>
          <button type="button" class="ct__btn" (click)="decline()">
            {{ labels.keep }}
          </button>
        </div>
      } @else {
        <p class="ct__verdict">{{ verdict() }}</p>
      }
    </div>
  `,
  styles: [
    `
      .ct {
        margin: 1rem 0;
        max-width: 26rem;
        border-radius: 14px;
        border: 1px solid var(--stone, #d9d7cb);
        border-left: 4px solid var(--danger, #b4453c);
        background: var(--paper, #fbfaf6);
        padding: 1rem 1.15rem;
        color: var(--ink, #20281f);
      }
      .ct--done {
        border-left-color: var(--stone, #d9d7cb);
      }
      .ct__eyebrow {
        margin: 0;
        font-size: 0.68rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--danger, #b4453c);
        font-weight: 600;
      }
      .ct--done .ct__eyebrow {
        color: var(--ink-soft, #6b7265);
      }
      .ct__what {
        margin: 0.35rem 0 0;
        font-family: var(--font-display, inherit);
        font-weight: 700;
        font-size: 1.02rem;
      }
      .ct__why {
        margin: 0.3rem 0 0;
        font-size: 0.85rem;
        color: var(--ink-soft, #6b7265);
      }
      .ct__actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.85rem;
      }
      .ct__btn {
        border: 1px solid var(--stone, #d9d7cb);
        background: transparent;
        color: var(--ink, #20281f);
        border-radius: 999px;
        padding: 0.4rem 0.95rem;
        font: inherit;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
      }
      .ct__btn:hover {
        background: rgba(32, 40, 31, 0.05);
      }
      .ct__btn--danger {
        background: var(--danger, #b4453c);
        border-color: var(--danger, #b4453c);
        color: #fff;
      }
      .ct__btn--danger:hover {
        background: #9d3a32;
      }
      .ct__verdict {
        margin: 0.7rem 0 0;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--ink-soft, #6b7265);
      }
    `,
  ],
})
export class ClearTripCard implements HumanInTheLoopToolRenderer<ClearTripArgs> {
  readonly toolCall = input.required<HumanInTheLoopToolCall<ClearTripArgs>>();

  readonly #store = inject(TripStore);
  protected readonly verdict = signal("");
  protected readonly decided = computed(
    () => this.verdict() !== "" || this.toolCall().status === "complete",
  );

  protected readonly labels = {
    eyebrow: $localize`:@@clear.eyebrow:Needs your approval`,
    keep: $localize`:@@clear.keep:Keep it`,
  };

  protected readonly reason = computed(() => this.toolCall().args?.reason);

  protected readonly dayLabel = computed(() => {
    const dayId = this.toolCall().args?.dayId;
    return (
      this.#store.days().find((d) => d.id === dayId)?.label ??
      dayId ??
      $localize`:@@clear.someDay:a day`
    );
  });

  protected readonly headline = computed(() =>
    this.toolCall().args?.scope === "trip"
      ? $localize`:@@clear.trip.question:Clear the entire trip?`
      : $localize`:@@clear.day.question:Remove ${this.dayLabel()}:label: from the trip?`,
  );

  protected readonly approveLabel = computed(() =>
    this.toolCall().args?.scope === "trip"
      ? $localize`:@@clear.trip.approve:Clear trip`
      : $localize`:@@clear.day.approve:Remove day`,
  );

  protected approve(): void {
    const call = this.toolCall();
    if (call.args?.scope === "trip") {
      this.#store.clearTrip();
    } else if (call.args?.dayId) {
      this.#store.removeDay(call.args.dayId);
    }
    this.verdict.set($localize`:@@clear.approved:Approved — done.`);
    call.respond("approved: the user confirmed and the change was applied");
  }

  protected decline(): void {
    this.verdict.set($localize`:@@clear.declined:Declined — nothing changed.`);
    this.toolCall().respond(
      "declined: the user chose to keep it; do not retry",
    );
  }
}
