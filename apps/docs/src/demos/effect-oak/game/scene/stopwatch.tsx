import { motion } from 'motion/react';
import type { MotionValue } from 'motion/react';

/** How long the car has been driving, top right, at each Frame. */
export const Stopwatch = ({ time }: { readonly time: MotionValue<string> }) => (
  <motion.span className="absolute top-3 right-5 font-mono text-xs text-neutral-400 tabular-nums">
    {time}
  </motion.span>
);

/** Milliseconds as `m:ss.t`, the way a lap time reads. */
export const lapTime = (ms: number) => {
  const tenths = Math.floor(ms / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
};
