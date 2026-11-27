import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  UndoIcon,
} from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { Focus, Mode } from '../logic/shared/index.js';
import { Say } from '../../../view/shared/index.js';

const TYPED = 'input, textarea, select, [contenteditable="true"]';

const useArrows = (on: boolean, onStep: (by: number) => void) => {
  const step = useRef(onStep);
  step.current = onStep;
  useEffect(() => {
    if (!on) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if ((event.target as Element | null)?.closest?.(TYPED)) return;
      event.preventDefault();
      step.current(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);
};

function Control({
  label,
  onClick,
  disabled = false,
  wide = false,
  strong = false,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly wide?: boolean;
  readonly strong?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 items-center justify-center gap-1.5 rounded-md transition-[color,background-color,scale] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none',
        strong
          ? 'bg-running/12 text-foreground hover:bg-running/20'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        wide ? 'px-2.5 text-xs font-medium' : 'w-8',
      )}
    >
      {children}
    </button>
  );
}

const PANEL =
  'pointer-events-auto rounded-lg border border-border bg-background/95 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_16px_rgb(0_0_0/0.06)] backdrop-blur';

function Showing({
  mode,
  focus,
}: {
  readonly mode: Mode;
  readonly focus: Focus;
}) {
  const story = mode === 'story';
  return (
    <p
      role="status"
      className="pointer-events-none absolute top-3 left-3 flex h-7 items-center gap-2 rounded-md border border-border bg-background/90 px-2.5 text-xs text-muted-foreground shadow-sm backdrop-blur"
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full transition-colors duration-200 motion-reduce:transition-none',
          story ? 'bg-running' : 'bg-muted-foreground/50',
        )}
      />
      {story ? (
        <span>
          <span className="font-medium text-foreground">Story</span> · Beat{' '}
          <span className="tabular-nums">
            {focus.index + 1} of {focus.of}
          </span>
        </span>
      ) : (
        <span>
          <span className="font-medium text-foreground">Exploring</span> · open
          any card by hand
        </span>
      )}
    </p>
  );
}

export function Playback({
  focus,
  mode,
  playing,
  shown,
  onStep,
  onPlay,
  onReturn,
}: {
  readonly focus: Focus | null;
  readonly mode: Mode;
  readonly playing: boolean;
  readonly shown: boolean;
  readonly onStep: (by: number) => void;
  readonly onPlay: (playing: boolean) => void;
  readonly onReturn: () => void;
}) {
  useArrows(shown && focus !== null, onStep);
  if (focus === null) return null;
  const story = mode === 'story';
  const last = focus.index === focus.of - 1;
  const { missing } = focus.picture;
  return (
    <>
      <Showing mode={mode} focus={focus} />
      <div
        data-space-ignore
        data-story-overlay
        className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 px-4"
      >
        <div
          className={cn(
            PANEL,
            'w-full max-w-md px-3.5 py-2.5 transition-opacity duration-200 ease-out motion-reduce:transition-none',
            !story && 'opacity-70',
          )}
        >
          <Say>{focus.beat.say}</Say>
          {missing.length > 0 && (
            <p className="mt-1.5 text-xs text-pretty text-muted-foreground">
              <span className="font-mono">{missing.join(', ')}</span> not found
              in this Blueprint
            </p>
          )}
        </div>
        <div className={cn(PANEL, 'flex items-center gap-0.5 p-1')}>
          {!story && (
            <>
              <Control label="Back to story" wide strong onClick={onReturn}>
                <UndoIcon aria-hidden className="size-3.5" />
                Back to story
              </Control>
              <span aria-hidden className="mx-1 h-4 w-px bg-border" />
            </>
          )}
          <Control
            label="Previous Beat"
            disabled={focus.index === 0}
            onClick={() => onStep(-1)}
          >
            <ChevronLeftIcon aria-hidden className="size-4" />
          </Control>
          <span
            aria-live="polite"
            className="min-w-12 text-center text-xs text-muted-foreground tabular-nums"
          >
            {focus.index + 1} / {focus.of}
          </span>
          <Control label="Next Beat" disabled={last} onClick={() => onStep(1)}>
            <ChevronRightIcon aria-hidden className="size-4" />
          </Control>
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <Control
            label={playing ? 'Pause' : 'Play'}
            wide
            onClick={() => onPlay(!playing)}
          >
            {playing ? (
              <PauseIcon aria-hidden className="size-3.5" />
            ) : (
              <PlayIcon aria-hidden className="size-3.5" />
            )}
            {playing ? 'Pause' : 'Play'}
          </Control>
        </div>
      </div>
    </>
  );
}
