import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/*
 * A number that rolls to its next value: the old one slides up and out as
 * the new one rises in, in tabular figures so the line around it never
 * shifts. Drawn first, it is still; with reduced motion, it only changes.
 */

const ROLL = { duration: 0.18, ease: [0.23, 1, 0.32, 1] } as const;

export function Count({
  value,
  className = '',
}: {
  readonly value: number;
  readonly className?: string;
}) {
  const reduced = useReducedMotion() === true;
  return (
    <span
      className={`relative inline-flex overflow-hidden tabular-nums ${className}`}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={reduced ? false : { y: '70%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: '-70%', opacity: 0 }}
          transition={reduced ? { duration: 0 } : ROLL}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
