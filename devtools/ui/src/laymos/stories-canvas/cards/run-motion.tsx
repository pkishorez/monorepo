import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { Play } from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';

/**
 * A thin bar along a card's top edge while its Proofs run: filled as far as
 * the run has got, with a sweep to show it is alive.
 */
export function RunningBar({
  fraction,
  reducedMotion,
}: {
  /** The share of the run's Proofs that have finished, 0 to 1. */
  readonly fraction: number;
  readonly reducedMotion: boolean;
}) {
  return (
    <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-sky-500/20">
      <motion.span
        className="absolute inset-y-0 left-0 bg-sky-500"
        initial={false}
        animate={{ width: `${fraction * 100}%` }}
        transition={{ duration: reducedMotion ? 0 : 0.3, ease: 'easeOut' }}
      />
      {!reducedMotion && (
        <motion.span
          className="absolute inset-y-0 w-1/3 rounded-full bg-sky-500/50"
          initial={{ left: '-33%' }}
          animate={{ left: '100%' }}
          transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity }}
        />
      )}
    </span>
  );
}

/** The pill a run's "x / y" sits in; the colours come with each use. */
export const countBadge =
  'inline-flex h-[18px] items-center whitespace-nowrap rounded-full px-1.5 text-[11px] font-medium leading-none tabular-nums';

const glow = {
  on: '0 0 0 1px rgb(14 165 233 / 0.35), 0 0 10px 1px rgb(14 165 233 / 0.4)',
  off: '0 0 0 1px rgb(14 165 233 / 0), 0 0 10px 1px rgb(14 165 233 / 0)',
} as const;

/**
 * "3 / 4" in a pill: how far a run has got. It glows while its Proofs run;
 * once the run ends the glow settles, then the pill fades out.
 */
export function RunCount({
  shown,
  done,
  total,
  reducedMotion,
  className,
}: {
  readonly shown: boolean;
  readonly done: number;
  readonly total: number;
  readonly reducedMotion: boolean;
  readonly className?: string;
}) {
  return (
    <AnimatePresence>
      {shown && total > 0 && (
        <motion.span
          key="count"
          aria-label={`${done} of ${total} Proofs finished`}
          className={cn(
            countBadge,
            'pointer-events-none bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
            className,
          )}
          initial={{ opacity: 0, boxShadow: glow.off }}
          animate={{
            opacity: 1,
            boxShadow: done < total ? glow.on : glow.off,
          }}
          exit={{
            opacity: 0,
            boxShadow: glow.off,
            transition: reducedMotion
              ? { duration: 0 }
              : {
                  boxShadow: { duration: 0.3, ease: 'easeOut' },
                  opacity: { duration: 0.5, delay: 0.3, ease: 'easeOut' },
                },
          }}
          transition={{ duration: reducedMotion ? 0 : 0.3 }}
        >
          {done} / {total}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/**
 * A card's sign of life while Proofs beneath it run: a soft inner glow in
 * the running colour that slowly breathes; a still border under reduced
 * motion. It draws only a shadow, so nothing moves.
 */
export function RunningGlow({
  running,
  reducedMotion,
}: {
  readonly running: boolean;
  readonly reducedMotion: boolean;
}) {
  return (
    <AnimatePresence>
      {running && (
        <motion.span
          key="glow"
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_rgb(14_165_233/0.55),inset_0_0_22px_-6px_rgb(14_165_233/0.45)]"
          initial={{ opacity: 0 }}
          animate={
            reducedMotion ? { opacity: 1 } : { opacity: [0.45, 1, 0.45] }
          }
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { duration: 2.6, ease: 'easeInOut', repeat: Infinity }
          }
        />
      )}
    </AnimatePresence>
  );
}

/** A short wash of the verdict's colour when a run finishes. */
export function VerdictFlash({
  running,
  colour,
  reducedMotion,
}: {
  readonly running: boolean;
  readonly colour: string;
  readonly reducedMotion: boolean;
}) {
  const arrival = useArrival(running);
  if (arrival === 0 || reducedMotion) return null;
  return (
    <motion.span
      key={arrival}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0', colour)}
      initial={{ opacity: 0.16 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
    />
  );
}

/** Counts each time `running` goes from true to false. */
function useArrival(running: boolean): number {
  const previous = useRef(running);
  const [arrival, setArrival] = useState(0);
  useEffect(() => {
    if (previous.current && !running) setArrival((count) => count + 1);
    previous.current = running;
  }, [running]);
  return arrival;
}

export function RunButton({
  label,
  running,
  onRun,
  reveal = 'card',
  shown = false,
  className,
}: {
  readonly label: string;
  readonly running: boolean;
  readonly onRun: () => void;
  /** Which hover or focus shows it. */
  readonly reveal?: 'card' | 'row';
  /** Whether it shows without hover or focus; on touch screens it always does. */
  readonly shown?: boolean;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      data-space-ignore
      aria-label={label}
      title={label}
      disabled={running}
      tabIndex={-1}
      onClick={(event) => {
        event.stopPropagation();
        onRun();
      }}
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[opacity,background-color,color,scale] duration-150',
        'opacity-0 hover:bg-muted hover:text-foreground active:scale-[0.94] disabled:pointer-events-none disabled:opacity-0',
        reveal === 'card'
          ? 'group-hover/card:opacity-100 group-focus-visible/card:opacity-100'
          : 'group-hover/row:opacity-100 group-focus-visible/row:opacity-100',
        // Hover does not exist on a touch screen.
        !running && '[@media(hover:none)]:opacity-100',
        !running && shown && 'opacity-100',
        className,
      )}
    >
      <Play className="size-3.5" />
    </button>
  );
}
