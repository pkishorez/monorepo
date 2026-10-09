import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { TimeTravel } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Slider } from '@kstackz/web-platform/components/slider';
import { seconds } from './seconds.js';

/**
 * The app's Time from its start to now, always at the bottom. Live, it
 * follows the end; grabbing it or stepping back switches to Replay. Each
 * Message is a mark on the track, and ‹ › jump between them.
 */
export const Scrubber = ({ time }: { readonly time: TimeTravel }) => {
  const { messages, paused } = time;
  const end = Math.max(useNow(time), 1);
  const at = time.at ?? end;
  const before = messages.findLast((m) => m.at < at)?.at;
  const after = messages.find((m) => m.at > at)?.at;

  const travel = (to: number) => {
    time.pause();
    time.travel(to);
  };

  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-t px-2 pb-[env(safe-area-inset-bottom)] sm:gap-2 sm:px-3">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Previous Message"
        disabled={at === 0}
        onClick={() => travel(before ?? 0)}
      >
        <ChevronLeft />
      </Button>
      <label className="relative flex flex-1 items-center px-1">
        <span className="sr-only">Time</span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1 -top-2.5 h-1.5"
        >
          {messages.map((m, index) => (
            <span
              key={index}
              className="absolute h-full w-px bg-muted-foreground/60"
              style={{ left: `${(m.at / end) * 100}%` }}
            />
          ))}
        </span>
        <Slider
          min={0}
          max={end}
          value={[at]}
          aria-valuetext={seconds(at)}
          onValueChange={(value) =>
            travel(Array.isArray(value) ? value[0]! : (value as number))
          }
        />
      </label>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Next Message"
        disabled={!paused || after === undefined}
        onClick={() => after !== undefined && travel(after)}
      >
        <ChevronRight />
      </Button>
      <span className="w-14 text-right font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:w-auto">
        {seconds(at)}
        <span className="max-sm:hidden"> / {seconds(end)}</span>
      </span>
    </div>
  );
};

/** The app's Time now: ten times a second while live, still while paused. */
const useNow = ({ now, paused }: TimeTravel) => {
  const [time, setTime] = useState(now);
  useEffect(() => {
    setTime(now());
    if (paused) return;
    const timer = setInterval(() => setTime(now()), 100);
    return () => clearInterval(timer);
  }, [now, paused]);
  return time;
};
