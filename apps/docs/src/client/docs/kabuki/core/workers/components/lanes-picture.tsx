import { motion } from 'motion/react';
import { useSteps } from '../../../../../components/index.ts';

/*
 * Where a Worker can live, as three lanes on one clock. Above them, the
 * Actor's State over time: Stopped, Running, Stopped, Running. A playhead
 * sweeps left to right, and each lane's bars grow as it passes: one
 * Worker runs for the Actor's whole life, one only while it is Running,
 * and one only while a test on its data holds. Nobody starts or stops
 * them; where they are written says when they run.
 */

type Span = readonly [number, number];

const STATES: ReadonlyArray<{ readonly name: string; readonly span: Span }> = [
  { name: 'Stopped', span: [0, 0.2] },
  { name: 'Running', span: [0.2, 0.55] },
  { name: 'Stopped', span: [0.55, 0.7] },
  { name: 'Running', span: [0.7, 1] },
];

const LANES: ReadonlyArray<{
  readonly name: string;
  readonly where: string;
  readonly spans: ReadonlyArray<Span>;
}> = [
  { name: 'connection', where: 'whole life', spans: [[0, 1]] },
  {
    name: 'tick',
    where: 'in Running',
    spans: [
      [0.2, 0.55],
      [0.7, 1],
    ],
  },
  {
    name: 'save',
    where: 'while unsaved',
    spans: [
      [0.32, 0.46],
      [0.78, 0.9],
    ],
  },
];

/** How many positions the playhead takes, end to end. */
const TICKS = 20;
const DURATIONS = [
  ...Array.from({ length: TICKS }, () => 220),
  2200,
] as ReadonlyArray<number>;

export function LanesPicture() {
  const [ref, step] = useSteps(DURATIONS, TICKS);
  const at = step / TICKS;
  const shown = ([from, to]: Span) => Math.max(0, Math.min(to, at) - from);
  return (
    <div ref={ref} className="px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-lg gap-3">
        <div className="flex w-24 shrink-0 flex-col gap-3">
          <span className="flex h-6 items-center text-xs text-muted-foreground">
            State
          </span>
          {LANES.map((lane) => (
            <span key={lane.name} className="flex h-8 flex-col justify-center">
              <span className="font-mono text-xs leading-tight">
                {lane.name}
              </span>
              <span className="text-[11px] leading-tight text-muted-foreground">
                {lane.where}
              </span>
            </span>
          ))}
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col gap-3">
          <div className="relative h-6">
            {STATES.map(({ name, span: [from, to] }, index) => (
              <span
                key={index}
                className={`absolute inset-y-0 grid place-items-center overflow-hidden rounded-md border-x border-background font-mono text-[10px] transition-colors duration-200 ${
                  name === 'Running'
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground'
                } ${at > from ? 'opacity-100' : 'opacity-30'}`}
                style={{
                  left: `${from * 100}%`,
                  width: `${(to - from) * 100}%`,
                }}
              >
                {name}
              </span>
            ))}
          </div>
          {LANES.map((lane) => (
            <div
              key={lane.name}
              className="relative h-8 rounded-md bg-muted/30"
            >
              {lane.spans.map((span, index) => (
                <motion.span
                  key={index}
                  className="absolute inset-y-2.5 rounded-full bg-emerald-500/80"
                  initial={false}
                  animate={{ width: `${shown(span) * 100}%` }}
                  transition={{ duration: 0.22, ease: 'linear' }}
                  style={{ left: `${span[0] * 100}%` }}
                />
              ))}
            </div>
          ))}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-y-1 w-px bg-foreground/50"
            initial={false}
            animate={{ left: `${at * 100}%` }}
            transition={{ duration: 0.22, ease: 'linear' }}
          />
          <span className="self-end font-mono text-[10px] text-muted-foreground">
            time →
          </span>
        </div>
      </div>
    </div>
  );
}
