import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircleIcon, RotateCcwIcon, SquareIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { Asking, At, Run, Turn } from '../logic/shared/index.js';
import { Chips } from './chips.js';
import { Say } from './say.js';

const useNow = (on: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
};

const elapsed = (since: number, now: number) => {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
};

const shortOf = (path: string) => path.split('/').at(-1) ?? path;

const SCROLL = '(prefers-reduced-motion: reduce)';

function Question({ asking }: { readonly asking: Asking }) {
  return (
    <div className="ml-6 flex flex-col items-end gap-1.5 self-end">
      {asking.question !== '' && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-pretty whitespace-pre-wrap text-foreground">
          {asking.question}
        </p>
      )}
      {asking.chips.length > 0 && <Chips chips={asking.chips} />}
    </div>
  );
}

function Answered({
  turn,
  index,
  at,
  missing,
  onJump,
  onCurrent,
}: {
  readonly turn: Turn;
  readonly index: number;
  readonly at: At | null;
  readonly missing: (turn: number, beat: number) => boolean;
  readonly onJump: (turn: number, beat: number) => void;
  readonly onCurrent: (element: HTMLLIElement | null) => void;
}) {
  if (turn.answer === null)
    return turn.text === null ? null : <Say>{turn.text}</Say>;
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-medium text-foreground">
        {turn.answer.title}
      </h3>
      <ol className="-mx-1.5 flex flex-col">
        {turn.answer.beats.map((beat, number) => {
          const current = at?.turn === index && at.beat === number;
          const lost = missing(index, number);
          return (
            <li key={number} ref={current ? onCurrent : undefined}>
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                onClick={() => onJump(index, number)}
                className={cn(
                  'group flex w-full cursor-pointer gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors duration-150 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  current && 'bg-muted hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] text-muted-foreground tabular-nums transition-colors duration-150 motion-reduce:transition-none',
                    current
                      ? 'border-running bg-running text-background'
                      : 'border-border',
                  )}
                >
                  {number + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-baseline gap-1.5 font-mono text-[11px] text-muted-foreground">
                    <span className="truncate" title={beat.focus}>
                      {shortOf(beat.focus)}
                    </span>
                    {lost && (
                      <span className="ml-auto shrink-0 font-sans text-removed">
                        not found
                      </span>
                    )}
                  </span>
                  <Say>{beat.say}</Say>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Running({
  run,
  onStop,
}: {
  readonly run: Run;
  readonly onStop: () => void;
}) {
  const now = useNow(true);
  const lines = run.activity.slice(-4);
  return (
    <div role="status" className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-running motion-reduce:animate-none" />
        Reading the code
        <span className="tabular-nums">{elapsed(run.since, now)}</span>
        <Button size="xs" variant="ghost" className="ml-auto" onClick={onStop}>
          <SquareIcon aria-hidden className="size-3" />
          Stop
        </Button>
      </div>
      {lines.length > 0 && (
        <ul className="flex flex-col gap-0.5 border-l border-border pl-2.5">
          {lines.map((line, at) => (
            <li
              key={`${run.activity.length - lines.length + at}`}
              className={cn(
                'truncate font-mono text-[11px] text-muted-foreground',
                at === lines.length - 1 && 'text-foreground/80',
              )}
            >
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Failure({
  reason,
  onRetry,
}: {
  readonly reason: string;
  readonly onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-border px-3 py-2.5">
      <p className="flex gap-2 text-sm text-pretty text-foreground">
        <AlertCircleIcon
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-removed"
        />
        {reason}
      </p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RotateCcwIcon aria-hidden className="size-3.5" />
        Retry
      </Button>
    </div>
  );
}

export function Turns({
  turns,
  pending,
  run,
  failure,
  at,
  missing,
  onJump,
  onStop,
  onRetry,
}: {
  readonly turns: ReadonlyArray<Turn>;
  readonly pending: Asking | null;
  readonly run: Run;
  readonly failure: string | null;
  readonly at: At | null;
  readonly missing: (turn: number, beat: number) => boolean;
  readonly onJump: (turn: number, beat: number) => void;
  readonly onStop: () => void;
  readonly onRetry: () => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLLIElement | null>(null);
  const count = turns.length + (pending === null ? 0 : 1);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [count, run.status]);
  useEffect(() => {
    current.current?.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia(SCROLL).matches ? 'auto' : 'smooth',
    });
  }, [at?.turn, at?.beat]);
  const onCurrent = useCallback((element: HTMLLIElement | null) => {
    current.current = element;
  }, []);
  if (count === 0)
    return (
      <div className="m-auto max-w-64 px-4 text-center">
        <p className="text-sm font-medium text-foreground">Ask how it works</p>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          The Agent reads this folder's code and answers as a story you play on
          the Blueprint, one Beat at a time.
        </p>
      </div>
    );
  return (
    <div className="flex flex-col gap-5 p-3">
      {turns.map((turn, index) => (
        <div key={index} className="flex flex-col gap-3">
          <Question asking={turn} />
          <Answered
            turn={turn}
            index={index}
            at={at}
            missing={missing}
            onJump={onJump}
            onCurrent={onCurrent}
          />
        </div>
      ))}
      {pending !== null && <Question asking={pending} />}
      {run.status === 'running' ? (
        <Running run={run} onStop={onStop} />
      ) : (
        failure !== null && <Failure reason={failure} onRetry={onRetry} />
      )}
      <div ref={end} />
    </div>
  );
}
