import {
  type AnimationPlaybackControls,
  animate,
  useMotionValue,
} from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Px between columns, and around them. */
export const GAP = 12;

const SPRING = { type: 'spring', visualDuration: 0.28, bounce: 0 } as const;

// Seconds of momentum a release carries into choosing the page.
const PROJECTION = 0.15;

/**
 * The board's columns side by side on a track that pages one column at a
 * time: nearly the whole width on a phone, 300px from a tablet up, where
 * they may all fit and it stops paging.
 */
export function usePager(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const column = width < 640 ? Math.max(0, width - 40) : 300;
  const track = count * column + (count + 1) * GAP;
  const max = Math.max(0, track - width);
  // Where x rests for each page: a column's start, until the last fits.
  const stops = [
    ...new Set(
      Array.from(
        { length: count },
        (_, i) => -Math.min(i * (column + GAP), max),
      ),
    ),
  ];

  const x = useMotionValue(0);
  const [page, setPage] = useState(0);
  const latest = useRef({ page, stops });
  latest.current = { page, stops };
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);

  const goTo = (to: number, velocity = 0, done?: () => void) => {
    const { stops } = latest.current;
    const index = Math.min(Math.max(to, 0), stops.length - 1);
    latest.current.page = index;
    setPage(index);
    animation.current?.stop();
    animation.current = animate(x, stops[index] ?? 0, {
      ...SPRING,
      velocity,
      onComplete: done,
    });
  };

  // A new width moves the stops: stay on the page.
  useEffect(() => {
    animation.current?.stop();
    x.jump(stops[Math.min(page, stops.length - 1)] ?? 0);
  }, [width]);

  return {
    ref,
    x,
    /** Each column's width in px. */
    column,
    track,
    page,
    /** Where x rests for each page, from the first. */
    stops,
    pages: stops.length,
    goTo,
    /** Fingers take the track, even mid-spring: where it is now. */
    grab: () => {
      animation.current?.stop();
      return x.get();
    },
    /** Follows fingers, with resistance past either end. */
    drag: (value: number) => {
      const end = latest.current.stops.at(-1) ?? 0;
      x.set(
        value > 0
          ? value * 0.3
          : value < end
            ? end + (value - end) * 0.3
            : value,
      );
    },
    /** Settles on the page momentum points at, one page at most from `from`. */
    release: (from: number, velocity: number) => {
      const { stops } = latest.current;
      const headed = x.get() + velocity * PROJECTION;
      let nearest = 0;
      stops.forEach((stop, i) => {
        if (
          Math.abs(stop - headed) < Math.abs((stops[nearest] ?? 0) - headed)
        ) {
          nearest = i;
        }
      });
      goTo(Math.min(Math.max(nearest, from - 1), from + 1), velocity);
    },
    /** The page it is on or headed for, read mid-Gesture. */
    current: () => latest.current.page,
  };
}

export type Pager = ReturnType<typeof usePager>;
