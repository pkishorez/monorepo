import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/*
 * What every idea's picture is made of. A picture is a few still steps,
 * one after another, and each step is a cause and what it changes: a
 * Message arrives, then only what it touches moves, then it holds long
 * enough to read. One thing moves at a time. A reader who asks for less
 * motion sees one step that tells the whole idea.
 */

/** Arriving: fast out of the gate, settling in. */
export const ENTER = { duration: 0.25, ease: [0.23, 1, 0.32, 1] } as const;
/** Leaving: quicker than arriving, speeding away. */
export const EXIT = { duration: 0.15, ease: [0.4, 0, 1, 1] } as const;
/** Going from one place to another on screen. */
export const MOVE = { duration: 0.4, ease: [0.77, 0, 0.175, 1] } as const;
/** An indicator following what is current. */
export const SPRING = { type: 'spring', duration: 0.35, bounce: 0 } as const;

/**
 * The step a picture is at, looping through steps held this many
 * milliseconds each, and how many times it has looped. Runs only while on
 * screen and not under the pointer; with less motion asked for, stays at
 * `still`.
 */
export function useSteps(durations: ReadonlyArray<number>, still: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ step: 0, round: 0 });
  // Timers, an observer and pointer listeners: the page around React,
  // given back on unmount.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAt({ step: still, round: 0 });
      return;
    }
    let step = 0;
    let visible = false;
    let hovered = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (!visible || hovered) return;
      timer = setTimeout(() => {
        step = (step + 1) % durations.length;
        setAt((previous) => ({
          step,
          round: step === 0 ? previous.round + 1 : previous.round,
        }));
        schedule();
      }, durations[step]);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      schedule();
    });
    const enter = () => {
      hovered = true;
      schedule();
    };
    const leave = () => {
      hovered = false;
      schedule();
    };
    observer.observe(element);
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    return () => {
      observer.disconnect();
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      clearTimeout(timer);
    };
  }, [durations, still]);
  return [ref, at.step, at.round] as const;
}

/** An Actor: its name, and its State or a fact beside it. */
export function Box({
  name,
  flash,
  compact = false,
  children,
  className,
}: {
  readonly name: string;
  /** Changes each time it should be seen to draw again. */
  readonly flash?: number;
  /** Shorter, for a tree of many. */
  readonly compact?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={`relative flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${compact ? 'h-8 text-[13px]' : 'h-10 text-sm'} ${className ?? ''}`}
    >
      <span className="font-medium">{name}</span>
      {children}
      <Flash at={flash} />
    </div>
  );
}

/**
 * An outline that lights up and fades, each time `at` changes, like a
 * render highlighted in React's devtools. Nothing before the first change.
 */
export function Flash({ at }: { readonly at?: number }) {
  if (!at) return null;
  return (
    <motion.span
      key={at}
      aria-hidden
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="pointer-events-none absolute -inset-px rounded-[inherit] border-2 border-foreground"
    />
  );
}

/** A State or a fact, as a small pill. */
export function Pill({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={`rounded-full border border-border px-2 py-0.5 font-mono text-[11px] ${className ?? ''}`}
    >
      {children}
    </span>
  );
}

/** A Message, as it is written in code. */
export function Message({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-md border border-foreground bg-background px-2 font-mono text-xs whitespace-nowrap ${className ?? ''}`}
    >
      {children}
    </span>
  );
}

/**
 * A value that rolls to its next one: up when it grows, down when it
 * shrinks, the old one leaving the way the new one came from.
 */
export function Roll({
  value,
  className,
}: {
  readonly value: number | string;
  readonly className?: string;
}) {
  const previous = useRef(value);
  const up = typeof value !== 'number' || value >= Number(previous.current);
  useEffect(() => {
    previous.current = value;
  }, [value]);
  const offset = up ? 8 : -8;
  return (
    <span
      className={`relative inline-grid overflow-hidden tabular-nums ${className ?? ''}`}
    >
      <AnimatePresence initial={false} mode="popLayout" custom={offset}>
        <motion.span
          key={value}
          custom={offset}
          variants={{
            from: (y: number) => ({ y, opacity: 0 }),
            at: { y: 0, opacity: 1, transition: ENTER },
            gone: (y: number) => ({ y: -y, opacity: 0, transition: EXIT }),
          }}
          initial="from"
          animate="at"
          exit="gone"
          className="col-start-1 row-start-1"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A pointer's arrow, its tip at the origin. */
export const ARROW =
  'M0 0 L0 15.5 L4.2 11.6 L7 17.8 L9.6 16.7 L6.9 10.6 L12.4 10.6 Z';

/**
 * How a pointer glides: a spring with no bounce, so it leaves quickly and
 * eases into place the way a hand does.
 */
export const GLIDE = { type: 'spring', stiffness: 140, damping: 22 } as const;

/**
 * The center of every element marked `data-target` inside `ref`, by its
 * name, measured from `ref`'s corner. Measured again as `ref` resizes.
 */
export function useTargets(ref: RefObject<HTMLElement | null>) {
  const [targets, setTargets] = useState<
    Readonly<Record<string, { readonly x: number; readonly y: number }>>
  >({});
  // A ResizeObserver: the page around React, given back on unmount.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const next: Record<string, { x: number; y: number }> = {};
      for (const target of element.querySelectorAll<HTMLElement>(
        '[data-target]',
      )) {
        const at = target.getBoundingClientRect();
        next[target.dataset['target']!] = {
          x: at.left - box.left + at.width / 2,
          y: at.top - box.top + at.height / 2,
        };
      }
      setTargets(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return targets;
}

/**
 * A pointer over a picture. It glides to `at`; while `pressed` it sinks a
 * little, and each time `clicks` goes up a ring spreads from its tip.
 */
export function Cursor({
  at,
  pressed,
  clicks,
}: {
  readonly at: { readonly x: number; readonly y: number } | undefined;
  readonly pressed: boolean;
  readonly clicks: number;
}) {
  if (!at) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-10"
      initial={false}
      animate={{ x: at.x, y: at.y }}
      transition={GLIDE}
    >
      {clicks > 0 && (
        <motion.span
          key={clicks}
          className="absolute -top-3 -left-3 size-6 rounded-full border border-foreground"
          initial={{ scale: 0.3, opacity: 0.7 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
      )}
      <motion.svg
        width={14}
        height={20}
        viewBox="-1 -1 14 20"
        className="overflow-visible drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
        style={{ originX: 0, originY: 0 }}
        initial={false}
        animate={{ scale: pressed ? 0.82 : 1 }}
        transition={
          pressed
            ? { duration: 0.1, ease: 'easeOut' }
            : { type: 'spring', stiffness: 500, damping: 24 }
        }
      >
        <path
          d={ARROW}
          strokeWidth={1.2}
          strokeLinejoin="round"
          className="fill-foreground stroke-background"
        />
      </motion.svg>
    </motion.div>
  );
}
