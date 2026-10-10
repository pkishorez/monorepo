import { motion, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';

/** Milliseconds as `MM:SS.cc`, the way Foldkit's stopwatch reads. */
const clock = (ms: number) => {
  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
  return `${pad(ms / 60_000)}:${pad((ms % 60_000) / 1000)}.${pad((ms % 1000) / 10)}`;
};

/** The time on the stopwatch, at each Frame, without a render. */
export const Face = ({
  frame,
  elapsed,
}: {
  readonly frame: MotionValue<number>;
  readonly elapsed: (at: number) => number;
}) => (
  <motion.p
    className="font-mono text-6xl font-semibold tabular-nums"
    aria-live="off"
  >
    {useTransform(frame, (at) => clock(elapsed(at)))}
  </motion.p>
);
