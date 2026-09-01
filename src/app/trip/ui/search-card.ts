import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import { ExternalLink, LucideAngularModule, Search } from "lucide-angular";
import { z } from "zod";
import type { AngularToolCall, ToolRenderer } from "@copilotkit/angular";

export const searchArgs = z.object({
  place: z.string(),
  topic: z.string(),
  query: z.string(),
});
type SearchArgs = z.infer<typeof searchArgs>;

interface SearchResult {
  place?: string;
  topic?: string;
  answer?: string | null;
  sources?: { title: string; url: string; snippet: string }[];
  error?: string;
}

/** Compact source list under the agent's answer, so claims are checkable. */
@Component({
  selector: "app-search-card",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <div class="sr">
      <p class="sr__eyebrow">
        <lucide-angular [img]="SearchIcon" [size]="12" />
        {{ label() }}
      </p>
      @if (pending()) {
        <p class="sr__pending">{{ pendingLabel }}</p>
      } @else if (data()?.error) {
        <p class="sr__note">{{ data()?.error }}</p>
      } @else {
        <ol class="sr__list">
          @for (src of sources(); track src.url) {
            <li>
              <a
                class="sr__link"
                [href]="src.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span class="sr__host">{{ host(src.url) }}</span>
                <span class="sr__title">{{ src.title }}</span>
                <lucide-angular
                  class="sr__ext"
                  [img]="ExtIcon"
                  [size]="12"
                />
              </a>
            </li>
          }
        </ol>
      }
    </div>
  `,
  styles: [
    `
      .sr {
        margin: 0.75rem 0;
        max-width: 26rem;
        border: 1px solid var(--stone, #d9d7cb);
        border-radius: 12px;
        background: var(--paper, #fbfaf6);
        padding: 0.7rem 0.9rem;
        color: var(--ink, #20281f);
      }
      .sr__eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        margin: 0;
        font-size: 0.68rem;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--ink-soft, #6b7265);
      }
      .sr__pending,
      .sr__note {
        margin: 0.4rem 0 0;
        font-size: 0.85rem;
        font-style: italic;
        color: var(--ink-soft, #6b7265);
      }
      .sr__list {
        list-style: none;
        margin: 0.45rem 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .sr__link {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        text-decoration: none;
        color: inherit;
        font-size: 0.85rem;
        padding: 0.2rem 0.25rem;
        border-radius: 6px;
      }
      .sr__link:hover {
        background: rgba(32, 40, 31, 0.05);
      }
      .sr__link:hover .sr__title {
        color: var(--cenote, #0e8c8c);
      }
      .sr__host {
        flex: none;
        font-size: 0.72rem;
        font-variant-numeric: tabular-nums;
        color: var(--ink-soft, #6b7265);
        min-width: 7.5rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sr__title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
      }
      .sr__ext {
        flex: none;
        color: var(--ink-soft, #6b7265);
      }
    `,
  ],
})
export class SearchCard implements ToolRenderer<SearchArgs> {
  readonly toolCall = input.required<AngularToolCall<SearchArgs>>();
  protected readonly SearchIcon = Search;
  protected readonly ExtIcon = ExternalLink;

  protected readonly pending = computed(
    () => this.toolCall().status !== "complete",
  );

  protected readonly data = computed<SearchResult | undefined>(() => {
    const call = this.toolCall();
    if (call.status !== "complete") return undefined;
    try {
      return JSON.parse(call.result) as SearchResult;
    } catch {
      return { error: $localize`:@@search.parseError:Could not read the search results.` };
    }
  });

  protected readonly pendingLabel = $localize`:@@search.pending:Searching…`;

  protected readonly sources = computed(() => this.data()?.sources ?? []);

  protected readonly label = computed(() => {
    const place = this.toolCall().args?.place;
    return place
      ? $localize`:@@search.sourcesFor:Sources · ${place}:place:`
      : $localize`:@@search.sources:Sources`;
  });

  protected host(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }
}
