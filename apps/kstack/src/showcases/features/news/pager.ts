import {
  type AnimationPlaybackControls,
  animate,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const SPRING = { type: 'spring', visualDuration: 0.28, bounce: 0 } as const;

// Seconds of momentum a release carries into choosing the tab.
const PROJECTION = 0.15;

/**
 * The tabs' pages side by side, one screen wide each, on a track that
 * follows the finger and settles on a tab. `progress` is the tab in view,
 * fractional mid-swipe, for the tab strip.
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

  const x = useMotionValue(0);
  const progress = useTransform(() => -x.get() / (width || 1));
  const [page, setPage] = useState(0);
  const latest = useRef({ page, width });
  useLayoutEffect(() => {
    latest.current = { page, width };
  });
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);

  const goTo = (to: number, velocity = 0) => {
    const index = Math.min(Math.max(to, 0), count - 1);
    latest.current.page = index;
    setPage(index);
    animation.current?.stop();
    animation.current = animate(x, -index * latest.current.width, {
      ...SPRING,
      velocity,
    });
  };

  // A new width moves every page: stay on the tab.
  useEffect(() => {
    animation.current?.stop();
    x.jump(-page * width);
  }, [width]);

  return {
    ref,
    x,
    progress,
    width,
    page,
    goTo,
    /** Fingers take the track, even mid-spring: where it is now. */
    grab: () => {
      animation.current?.stop();
      return x.get();
    },
    /** Follows fingers, with resistance past the first and last tab. */
    drag: (value: number) => {
      const end = -(count - 1) * latest.current.width;
      x.set(
        value > 0
          ? value * 0.3
          : value < end
            ? end + (value - end) * 0.3
            : value,
      );
    },
    /** Settles on the tab momentum points at, one tab at most from `from`. */
    release: (from: number, velocity: number) => {
      const { width } = latest.current;
      const headed = -(x.get() + velocity * PROJECTION) / (width || 1);
      goTo(
        Math.min(Math.max(Math.round(headed), from - 1), from + 1),
        velocity,
      );
    },
    /** The tab it is on or headed for, read mid-Gesture. */
    current: () => latest.current.page,
  };
}

export type Pager = ReturnType<typeof usePager>;
