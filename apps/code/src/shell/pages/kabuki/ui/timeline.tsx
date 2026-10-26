import type { ReactNode } from 'react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Dock } from './dock.tsx';

/*
 * The timeline at the foot of the page: one tick per Step, or per Scene in
 * a Story, shaded by who sent it, in a dock to hover and drag through
 * (./dock.tsx), then the controls. Playing is the one
 * filled button; going back to live, when there is a live to go back to,
 * is a quiet one.
 */

export type Tone =
  | 'view'
  | 'worker'
  | 'command'
  | 'outside'
  | 'restore'
  | 'scene';

export interface Tick {
  readonly id: string;
  readonly label: string;
  readonly tone: Tone;
}

const TONE: Record<Tone, string> = {
  view: 'bg-foreground',
  worker: 'bg-muted-foreground',
  command: 'bg-foreground/60',
  outside: 'bg-border',
  restore: 'bg-muted-foreground/50',
  scene: 'bg-foreground',
};

export function Timeline({
  ticks,
  at,
  onAt,
  playing,
  onPlaying,
  live,
  caption,
  extra,
}: {
  readonly ticks: ReadonlyArray<Tick>;
  /** The tick shown; null while live. */
  readonly at: number | null;
  readonly onAt: (at: number | null) => void;
  readonly playing: boolean;
  readonly onPlaying: (playing: boolean) => void;
  /** Whether there is a live app to go back to, and whether it is shown. */
  readonly live?: { readonly shown: boolean };
  readonly caption: ReactNode;
  /** Controls of the mode's own, before the way back to live. */
  readonly extra?: ReactNode;
}) {
  const last = ticks.length - 1;
  const index = at ?? last;
  const go = (to: number) => onAt(Math.max(0, Math.min(last, to)));
  return (
    <footer className="border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
      <Dock
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
      />
      <div className="flex items-center gap-2 px-3 pt-1 pb-3">
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
          className="size-11 md:size-9"
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          aria-label={playing ? 'Pause' : 'Play'}
          disabled={ticks.length === 0}
          onClick={() => onPlaying(!playing)}
          className="size-11 md:size-9"
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
          className="size-11 md:size-9"
        >
          <ChevronRightIcon aria-hidden />
        </Button>
        <div className="min-w-0 flex-1 text-sm">{caption}</div>
        {extra}
        {live &&
          (live.shown ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="size-2 animate-breathe rounded-full bg-foreground motion-reduce:animate-none"
              />
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
              className="h-11 shrink-0 md:h-8"
            >
              Live
            </Button>
          ))}
      </div>
    </footer>
  );
}
