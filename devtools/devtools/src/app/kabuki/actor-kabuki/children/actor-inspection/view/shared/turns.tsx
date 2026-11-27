import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircleIcon, RotateCcwIcon, SquareIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { Asking, Run } from '../../logic/shared/index.js';
import { Chips } from './chips.js';

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

function Running({
  run,
  working,
  onStop,
}: {
  readonly run: Run;
  readonly working: string;
  readonly onStop: () => void;
}) {
  const now = useNow(true);
  const lines = run.activity.slice(-4);
  return (
    <div role="status" className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-running motion-reduce:animate-none" />
        {working}
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

export function Turns<T extends Asking>({
  turns,
  pending,
  run,
  failure,
  working,
  empty,
  answer,
  onStop,
  onRetry,
}: {
  readonly turns: ReadonlyArray<T>;
  readonly pending: Asking | null;
  readonly run: Run;
  readonly failure: string | null;
  readonly working: string;
  readonly empty: ReactNode;
  readonly answer: (turn: T, index: number) => ReactNode;
  readonly onStop: () => void;
  readonly onRetry: () => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const count = turns.length + (pending === null ? 0 : 1);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [count, run.status]);
  if (count === 0) return empty;
  return (
    <div className="flex flex-col gap-5 p-3">
      {turns.map((turn, index) => (
        <div key={index} className="flex flex-col gap-3">
          <Question asking={turn} />
          {answer(turn, index)}
        </div>
      ))}
      {pending !== null && <Question asking={pending} />}
      {run.status === 'running' ? (
        <Running run={run} working={working} onStop={onStop} />
      ) : (
        failure !== null && <Failure reason={failure} onRetry={onRetry} />
      )}
      <div ref={end} />
    </div>
  );
}
