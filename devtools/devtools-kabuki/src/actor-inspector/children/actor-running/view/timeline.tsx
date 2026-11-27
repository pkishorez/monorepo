import type { ReactNode } from 'react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { Tick, Timeline as Shown, Tone } from '../logic/shared/index.ts';
import { Track } from './track.tsx';

const TONE: Record<Tone, string> = {
  took: 'bg-foreground',
  ignored: 'bg-muted-foreground/45',
};

export function Timeline({
  ticks,
  at,
  onAt,
  playing,
  onPlaying,
  running,
  extra,
  place = 'bottom',
}: {
  readonly ticks: ReadonlyArray<Tick>;
  readonly at: number | null;
  readonly onAt: (at: number | null) => void;
  readonly playing: boolean;
  readonly onPlaying: (playing: boolean) => void;
  readonly running: boolean;
  readonly extra?: ReactNode;
  readonly place?: Shown['place'];
}) {
  const last = ticks.length - 1;
  const index = at ?? last;
  const go = (to: number) => onAt(Math.max(0, Math.min(last, to)));
  const digits = Math.max(2, String(Math.max(1, ticks.length)).length);
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
          place === 'bottom' &&
            '@xl:pr-[calc(var(--dock-reserve,0px)+0.75rem)]',
        )}
      >
        <Track
          ticks={ticks.map((tick) => ({
            id: String(tick.id),
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
        <span
          className="ml-auto shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums @xl:ml-0"
          style={{ minWidth: `${digits * 2 + 1}ch` }}
        >
          {index < 0
            ? 'start'
            : ticks.length > 0
              ? `${index + 1}/${ticks.length}`
              : '0/0'}
        </span>
        {extra}
        <div className="flex h-8 w-24 shrink-0 items-center justify-end touch:h-11">
          {at === null ? (
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium',
                running
                  ? 'bg-running/10 text-running'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {running ? 'Running' : 'Stopped'}
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
              title="Go back to now: the app runs at its Head again"
              className="h-7 rounded-full touch:h-11"
            >
              Now
            </Button>
          )}
        </div>
      </div>
    </footer>
  );
}
