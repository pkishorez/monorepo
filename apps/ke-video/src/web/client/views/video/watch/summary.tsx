import { useId } from 'react';
import { MarkdownViewer } from '@kestack/web-platform/ui/viewers/markdown-viewer';
import type { Summary as SummaryData } from '../../../../../video/library/schema.ts';
import { clock } from '../../../format/index.ts';
import { type Player, usePlayingAt } from './player.ts';

function Time({
  at,
  player,
}: {
  readonly at: number;
  readonly player: Player;
}) {
  return (
    <button
      type="button"
      onClick={() => player.seek(at)}
      className="relative rounded-sm text-sm text-muted-foreground tabular-nums underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-3 hover:text-foreground hover:underline"
    >
      {clock(at)}
    </button>
  );
}

/** The chapters, the one being played marked; a click seeks to one. */
export function Chapters({
  chapters,
  player,
}: {
  readonly chapters: SummaryData['chapters'];
  readonly player: Player;
}) {
  const playing = usePlayingAt(player, chapters);
  const heading = useId();
  if (chapters.length === 0) return null;
  return (
    <section aria-labelledby={heading} className="space-y-2">
      <h2 id={heading} className="text-sm font-medium text-muted-foreground">
        Chapters
      </h2>
      <ol className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
        {chapters.map((chapter, index) => (
          <li key={index}>
            <button
              type="button"
              onClick={() => player.seek(chapter.at)}
              aria-current={index === playing || undefined}
              className="grid min-h-11 w-full grid-cols-[3.25rem_1fr] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-muted/60 aria-current:bg-muted motion-reduce:transition-none lg:pointer-fine:min-h-9"
            >
              <span className="text-muted-foreground tabular-nums">
                {clock(chapter.at)}
              </span>
              <span className="truncate">{chapter.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What it says, then its key points, each with the time it is said. */
export function Summary({
  summary,
  player,
}: {
  readonly summary: SummaryData;
  readonly player: Player;
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="max-w-[68ch] space-y-5">
      <h2 id={heading} className="text-sm font-medium text-muted-foreground">
        Summary
      </h2>
      <MarkdownViewer className="text-[15px] leading-7">
        {summary.overview}
      </MarkdownViewer>
      {summary.points.length > 0 && (
        <ul className="space-y-3">
          {summary.points.map((point, index) => (
            <li
              key={index}
              className="grid grid-cols-[3.25rem_1fr] gap-2 text-[15px] leading-6"
            >
              <span className="pt-px">
                <Time at={point.at} player={player} />
              </span>
              <span>{point.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
