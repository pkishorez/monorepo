import { motion } from 'motion/react';
import { cx, ink } from '../../ink/index.ts';

/*
 * The lines of the Map, and what is written on them.
 *
 * 1. Link  a line from a Node to one below it, laid out already: solid and
 *          darker to something lit, dashed and faint to something dim.
 * 2. Via   the State that leads down a line, as a small option on it: filled
 *          while an Instance is in that State.
 *
 * Both all but fade out of focus. A line grows out of the card it hangs
 * from when what it leads to unfolds, and draws back into it on a fold.
 */

// 1. Link
export function Link({
  d,
  lit,
  shown = 1,
  from,
  custom,
  still = false,
}: {
  readonly d: string;
  readonly lit: boolean;
  /** How much of it shows: less when it is out of focus. */
  readonly shown?: number;
  /** The line it grows from and shrinks back to, from the Map as it is then: a point on the card it hangs from. */
  readonly from?: (now: unknown) => string | undefined;
  /** The Map as it is now, handed to `from`. */
  readonly custom?: unknown;
  readonly still?: boolean | null;
}) {
  const move = still
    ? { duration: 0 }
    : ({ duration: 0.42, ease: [0.32, 0.72, 0, 1] } as const);
  return (
    <motion.path
      fill="none"
      strokeWidth={lit ? 1.5 : 1}
      strokeDasharray={lit ? undefined : '3 4'}
      variants={{
        away: (now: unknown) => ({
          d: from?.(now) ?? d,
          opacity: 0,
          transition: still
            ? { duration: 0 }
            : { duration: 0.3, ease: [0.65, 0, 0.35, 1] },
        }),
        here: { d, opacity: shown, transition: move },
      }}
      custom={custom}
      initial="away"
      animate="here"
      exit="away"
      style={{
        stroke: lit ? ink('line-lit') : ink('line'),
        transition: 'stroke 200ms ease',
      }}
    />
  );
}

// 2. Via
export function Via({
  text,
  x,
  y,
  align,
  lit,
  shown = 1,
}: {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly align: 'middle' | 'start';
  readonly lit: boolean;
  readonly shown?: number;
}) {
  return (
    <span
      className={cx(
        'bg-background pointer-events-none absolute flex h-4 -translate-y-1/2 items-center gap-1 rounded-full px-1.5 text-[10px] whitespace-nowrap',
        align === 'middle' && '-translate-x-1/2',
      )}
      style={{
        left: x,
        top: y,
        opacity: shown,
        color: lit ? ink('lit') : ink('dim'),
        transition:
          'color 200ms ease, opacity 150ms ease, left 420ms cubic-bezier(0.32, 0.72, 0, 1), top 420ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <span
        className="size-1.5 rounded-full border transition-colors duration-200"
        style={{
          borderColor: lit ? ink('active') : ink('dim'),
          backgroundColor: lit ? ink('active') : 'transparent',
        }}
      />
      {text}
    </span>
  );
}
