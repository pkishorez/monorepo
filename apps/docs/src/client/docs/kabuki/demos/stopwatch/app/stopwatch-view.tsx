import { useRef } from 'react';
import { motion, useAnimationFrame, useMotionValue } from 'motion/react';
import { View, useLive } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { StopwatchLive } from './stopwatch.ts';

const clock = (ms: number) => {
  const hundredths = Math.floor(ms / 10);
  const seconds = Math.floor(hundredths / 100);
  return `${Math.floor(seconds / 60)}:${`${seconds % 60}`.padStart(2, '0')}.${`${hundredths % 100}`.padStart(2, '0')}`;
};

// Draws the time, two buttons that change with the State, and the last laps.
export const StopwatchView = View.make(
  StopwatchLive,
  ({ _tag, model, send, root }) => {
    const running = _tag === 'Running';
    return (
      <div
        {...root}
        className="flex w-full max-w-64 flex-col items-center gap-5"
      >
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`size-1.5 rounded-full ${
              running ? 'animate-pulse bg-emerald-500' : 'bg-border'
            }`}
          />
          {_tag}
        </span>
        <output className="font-mono text-5xl font-medium tracking-tight tabular-nums sm:text-6xl">
          <Time ms={model.elapsed} running={running} />
        </output>
        <div className="grid w-full grid-cols-2 gap-2">
          {running ? (
            <Button
              variant="outline"
              size="lg"
              onClick={() => send({ _tag: 'Lapped' })}
            >
              Lap
            </Button>
          ) : (
            <Button
              variant="outline"
              size="lg"
              disabled={_tag === 'Idle'}
              onClick={() => send({ _tag: 'Reset' })}
            >
              Reset
            </Button>
          )}
          {running ? (
            <Button
              variant="outline"
              size="lg"
              onClick={() => send({ _tag: 'Paused' })}
            >
              Pause
            </Button>
          ) : (
            <Button size="lg" onClick={() => send({ _tag: 'Started' })}>
              {_tag === 'Idle' ? 'Start' : 'Resume'}
            </Button>
          )}
        </div>
        <Laps laps={model.laps} />
      </div>
    );
  },
);

// Between Ticks, the time counts on, on screen only: each frame writes
// the text straight to the page, so nothing goes back to the Actor, and it
// stands still while the devtools show a past Step.
function Time({ ms, running }: { ms: number; running: boolean }) {
  const live = useLive();
  const counting = running && live;
  const text = useMotionValue(clock(ms));
  // When the time last came from the Actor, or started counting on.
  const from = useRef<{ key: string; at: number }>(undefined);
  useAnimationFrame((now) => {
    const key = `${ms}:${counting}`;
    if (from.current?.key !== key) from.current = { key, at: now };
    const extra = counting ? Math.min(now - from.current.at, 1000) : 0;
    text.set(clock(ms + extra));
  });
  return <motion.span>{text}</motion.span>;
}

// The newest three laps, each as long as it took.
function Laps({ laps }: { laps: ReadonlyArray<number> }) {
  if (laps.length === 0)
    return (
      <p className="grid h-[4.5rem] place-items-center text-xs text-muted-foreground">
        Press Lap while it runs.
      </p>
    );
  const rows = laps
    .map((total, index) => ({
      n: index + 1,
      took: total - (laps[index - 1] ?? 0),
    }))
    .slice(-3)
    .reverse();
  return (
    <ol className="h-[4.5rem] w-full divide-y divide-border text-sm">
      {rows.map(({ n, took }) => (
        <li key={n} className="flex h-6 items-center justify-between">
          <span className="text-muted-foreground">Lap {n}</span>
          <span className="font-mono tabular-nums">{clock(took)}</span>
        </li>
      ))}
    </ol>
  );
}
