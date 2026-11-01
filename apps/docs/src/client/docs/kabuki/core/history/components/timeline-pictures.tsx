import { motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  MOVE,
  SPRING,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * Two drawings of a History, each a small sketch above its line of
 * Messages. In the first, Painted Messages grow the line one dot at a
 * time, then the ring goes back to an earlier dot and the sketch shows
 * what it was there. In the second, the ring goes back, and from there a
 * new Branch grows beside the old line, which stays, dimmed.
 */

type Cell = 'ink' | 'rose' | null;

const GAP = 44;
const LANES = [14, 46];
const x = (step: number) => 14 + step * GAP;

function Sketch({
  cells,
  label,
  past,
}: {
  readonly cells: ReadonlyArray<Cell>;
  readonly label: string;
  readonly past: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Sketch</span>
        <span
          className={`rounded-full px-2.5 py-1 font-mono text-[11px] whitespace-nowrap transition-colors duration-200 ${past ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
        >
          {label}
        </span>
      </div>
      <div className="mt-3 flex gap-1.5">
        {cells.map((cell, at) => (
          <span
            key={at}
            className={`size-8 rounded-md border border-border transition-colors duration-200 ${cell === 'ink' ? 'bg-foreground' : cell === 'rose' ? 'bg-rose-500' : 'bg-muted/40'}`}
          />
        ))}
      </div>
    </div>
  );
}

function Dot({
  cx,
  cy,
  shown,
  dim = false,
  init = false,
}: {
  readonly cx: number;
  readonly cy: number;
  readonly shown: boolean;
  readonly dim?: boolean;
  readonly init?: boolean;
}) {
  return (
    <motion.rect
      x={cx - 4}
      y={cy - 4}
      width={8}
      height={8}
      rx={init ? 2 : 4}
      fill="currentColor"
      initial={false}
      animate={{ opacity: shown ? (dim ? 0.25 : 1) : 0, scale: shown ? 1 : 0 }}
      style={{ originX: '50%', originY: '50%' }}
      transition={shown ? ENTER : EXIT}
    />
  );
}

function Ring({ cx, cy }: { readonly cx: number; readonly cy: number }) {
  return (
    <motion.circle
      r={8.5}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      initial={false}
      animate={{ cx, cy }}
      transition={SPRING}
    />
  );
}

const fill = (count: number, colour: Cell = 'ink'): ReadonlyArray<Cell> =>
  Array.from({ length: 4 }, (_, at) => (at < count ? colour : null));

/** Init, four Messages one by one, back to Step 2, then live again. */
const TRAVEL = [1000, 800, 800, 800, 1400, 2600, 1200];
const TRAVEL_SHOWN = [0, 1, 2, 3, 4, 2, 4];

export function TravelPicture() {
  const [ref, step, round] = useSteps(TRAVEL, 5);
  const grown = Math.min(step, 4);
  const at = TRAVEL_SHOWN[step]!;
  const past = at < grown;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-10">
      <div key={round} className="w-full max-w-60">
        <Sketch
          cells={fill(at)}
          label={past ? `Step ${at}, read only` : 'live'}
          past={past}
        />
        <svg
          width={x(4) + 14}
          height={28}
          className="mx-auto mt-4 block overflow-visible text-foreground"
        >
          <motion.line
            x1={x(0)}
            y1={LANES[0]}
            y2={LANES[0]}
            className="stroke-border"
            initial={false}
            animate={{ x2: x(grown) }}
            transition={MOVE}
          />
          {[0, 1, 2, 3, 4].map((dot) => (
            <Dot
              key={dot}
              cx={x(dot)}
              cy={LANES[0]!}
              shown={dot <= grown}
              init={dot === 0}
            />
          ))}
          <Ring cx={x(at)} cy={LANES[0]!} />
        </svg>
      </div>
    </div>
  );
}

/** Live at Step 4, back to Step 2, the new line, two Messages on it, out. */
const BRANCH = [1600, 1400, 1000, 900, 2600, 400];

export function BranchPicture() {
  const [ref, step, round] = useSteps(BRANCH, 4);
  const leaving = step === BRANCH.length - 1;
  const at = Math.min(step, 4);
  const grown = at >= 2;
  const onBranch = Math.max(0, at - 2);
  const cells: ReadonlyArray<Cell> =
    at === 0
      ? fill(4)
      : [...fill(2).slice(0, 2), ...fill(onBranch, 'rose').slice(0, 2)];
  const ring =
    at === 0
      ? { cx: x(4), cy: LANES[0]! }
      : onBranch === 0
        ? { cx: x(2), cy: LANES[0]! }
        : { cx: x(2 + onBranch), cy: LANES[1]! };
  return (
    <div ref={ref} className="grid place-items-center px-4 py-10">
      <motion.div
        key={round}
        animate={
          leaving
            ? { opacity: 0, transition: EXIT }
            : { opacity: 1, transition: ENTER }
        }
        className="w-full max-w-60"
      >
        <Sketch
          cells={cells}
          label={
            at === 1 ? 'Step 2, read only' : grown ? 'live, new Branch' : 'live'
          }
          past={at === 1}
        />
        <svg
          width={x(4) + 14}
          height={60}
          className="mx-auto mt-4 block overflow-visible text-foreground"
        >
          <line
            x1={x(0)}
            y1={LANES[0]}
            x2={x(2)}
            y2={LANES[0]}
            className="stroke-border"
          />
          <motion.line
            x1={x(2)}
            y1={LANES[0]}
            x2={x(4)}
            y2={LANES[0]}
            className="stroke-border"
            initial={false}
            animate={{ opacity: at === 0 ? 1 : 0.4 }}
          />
          <motion.path
            d={`M ${x(2)} ${LANES[0]} C ${x(2)} ${LANES[1]}, ${x(3) - 24} ${LANES[1]}, ${x(3)} ${LANES[1]} L ${x(4)} ${LANES[1]}`}
            fill="none"
            className="stroke-border"
            initial={false}
            animate={{ pathLength: grown ? 1 : 0 }}
            transition={MOVE}
          />
          {[0, 1, 2, 3, 4].map((dot) => (
            <Dot
              key={dot}
              cx={x(dot)}
              cy={LANES[0]!}
              shown
              dim={dot > 2 && at > 0}
              init={dot === 0}
            />
          ))}
          {[3, 4].map((dot) => (
            <Dot
              key={dot}
              cx={x(dot)}
              cy={LANES[1]!}
              shown={dot - 2 <= onBranch}
            />
          ))}
          <Ring {...ring} />
        </svg>
      </motion.div>
    </div>
  );
}
