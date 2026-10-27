import type { ReactNode } from 'react';
import { Button } from '#components/button';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from '#kit/icons';
import { cn } from '#kit/class-names';
import { Track } from './track.tsx';

/*
 * The timeline at the foot of the Devtools, in one row: the controls, the
 * track of every Step, or every Scene in a Story, marked by what came of
 * it (./track.tsx), where it is, the mode's own controls, and the way back to
 * live. Narrow, as a phone or a side panel, the track takes a row of its
 * own above the rest: it goes by its own width, not the screen's.
 *
 * A Step's mark says one thing, what came of its Message: in the text's
 * colour when a rule took it, grey when none did and it changed nothing.
 * Where the Step shown is, the handle and the filled rail say. Playing is
 * the one filled button.
 */

/** What came of a Step's Message: a rule took it, or none did; or a Scene. */
export type Tone = 'took' | 'ignored' | 'scene';

export interface Tick {
  readonly id: string;
  readonly label: string;
  readonly tone: Tone;
}

const TONE: Record<Tone, string> = {
  took: 'bg-foreground',
  ignored: 'bg-muted-foreground/45',
  scene: 'bg-foreground',
};

export function Timeline({
  ticks,
  at,
  onAt,
  playing,
  onPlaying,
  live,
  extra,
  place = 'bottom',
}: {
  readonly ticks: ReadonlyArray<Tick>;
  /** The tick shown; null while live. */
  readonly at: number | null;
  readonly onAt: (at: number | null) => void;
  readonly playing: boolean;
  readonly onPlaying: (playing: boolean) => void;
  /** Whether there is a live app to go back to, and whether it is shown. */
  readonly live?: { readonly shown: boolean };
  /** Controls of the mode's own, before the way back to live. */
  readonly extra?: ReactNode;
  /** Under the canvas, or over it, right under the app it travels. */
  readonly place?: 'top' | 'bottom';
}) {
  const last = ticks.length - 1;
  const index = at ?? last;
  const go = (to: number) => onAt(Math.max(0, Math.min(last, to)));
  const digits = String(Math.max(1, ticks.length)).length;
  return (
    <footer
      className={cn(
        '@container border-border bg-background',
        place === 'top'
          ? 'order-first border-b'
          : 'border-t pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-1 gap-y-1 px-2 py-1.5 @xl:flex-nowrap @xl:gap-x-2 @xl:px-3',
          // At the foot, clear of a Dock's button in the corner, which hands
          // the room it takes: one row, all of it; narrow, only the bottom
          // row, the track's.
          place === 'bottom' &&
            '@xl:pr-[calc(var(--dock-reserve,0px)+0.75rem)]',
        )}
      >
        <Track
          ticks={ticks.map((tick) => ({
            id: tick.id,
            label: tick.label,
            shade: TONE[tick.tone],
          }))}
          index={index}
          onPick={(to) => {
            onPlaying(false);
            onAt(to);
          }}
          className={cn(
            'px-1 @xl:order-none @xl:w-auto @xl:flex-1',
            place === 'bottom'
              ? 'order-last w-[calc(100%-var(--dock-reserve,0px))]'
              : 'order-first w-full',
          )}
        />
        <div className="flex items-center gap-0.5 @xl:order-first">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Step back"
            disabled={index <= 0}
            onClick={() => {
              onPlaying(false);
              go(index - 1);
            }}
            className="size-8 touch:size-11"
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={ticks.length === 0}
            onClick={() => onPlaying(!playing)}
            className="size-8 rounded-full touch:size-11"
          >
            {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Step forward"
            disabled={index >= last}
            onClick={() => {
              onPlaying(false);
              go(index + 1);
            }}
            className="size-8 touch:size-11"
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
        {/* As wide as its widest number, so it never nudges what is beside it. */}
        <span
          className="ml-auto shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums @xl:ml-0"
          style={{ minWidth: `${digits * 2 + 1}ch` }}
        >
          {ticks.length > 0 ? `${index + 1}/${ticks.length}` : '0/0'}
        </span>
        {extra}
        {live && (
          // Both are the same size: going live or back never moves the row.
          <div className="flex h-8 w-20 shrink-0 items-center justify-end touch:h-11">
            {live.shown ? (
              <span className="rounded-full bg-running/10 px-2.5 py-1 text-xs font-medium text-running">
                Live
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onPlaying(false);
                  onAt(null);
                }}
                className="h-7 rounded-full touch:h-11"
              >
                Go live
              </Button>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
