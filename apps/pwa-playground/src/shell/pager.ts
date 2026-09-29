import { useLocation, useNavigate } from '@tanstack/react-router';
import { useGesture } from '@kstackz/use-gesture/core';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  type AnimationPlaybackControls,
  animate,
  type MotionValue,
  useMotionValue,
} from '@kstackz/ui-toolkit/motion';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { neighbours, type Page } from '../lib/chapters.ts';

const SPRING = { type: 'spring', stiffness: 500, damping: 45 } as const;

// How far the page follows the finger: it trails, then stops at MAX.
const MAX = 96;
const follow = (offset: number) => (MAX * offset) / (offset + MAX);

export type Pager = {
  /** The page's translateX while fingers turn it. */
  readonly x: MotionValue<number>;
  /** -1 toward the previous page, 1 toward the next, 0 at rest. */
  readonly way: MotionValue<number>;
  /** Whether letting go now turns the page. */
  readonly armed: MotionValue<boolean>;
  readonly prev?: Page;
  readonly next?: Page;
};

const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest(
    'input, textarea, select, [contenteditable="true"], [role="slider"], [role="tablist"], [data-stage]',
  ) !== null;

/**
 * Turning pages in reading order: a Swipe left for the next page, right for
 * the previous one, and the arrow keys on a keyboard. A Swipe that starts in
 * `edge` px of the left side is the menu's, so it never turns the page.
 */
export function usePager(options: {
  readonly enabled: boolean;
  readonly edge: number;
}): Pager {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { prev, next } = neighbours(pathname);
  const x = useMotionValue(0);
  const way = useMotionValue(0);
  const armed = useMotionValue(false);
  const fromEdge = useRef(false);
  const moving = useRef<-1 | 1 | 0>(0);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);

  useGesture({
    enabled: options.enabled,
    onStart: (pointers) => {
      const [first] = pointers.values();
      fromEdge.current = first !== undefined && first.start.x <= options.edge;
    },
  });

  const settle = () => {
    moving.current = 0;
    way.set(0);
    armed.set(false);
    animation.current?.stop();
    animation.current = animate(x, 0, SPRING);
  };

  const turn = (to: Page | undefined, sign: -1 | 1) => ({
    enabled: options.enabled && to !== undefined,
    commit: { distance: 110, velocity: 600 },
    onStart: () => {
      if (fromEdge.current) return;
      animation.current?.stop();
      moving.current = sign;
      way.set(sign);
    },
    onCommit: () => {
      if (moving.current !== sign || to === undefined) return;
      moving.current = 0;
      armed.set(false);
      void navigate({ to: to.path });
    },
    onCancel: () => {
      if (moving.current === sign) settle();
    },
  });

  const toNext = useSwipe({ direction: 'left', ...turn(next, 1) });
  const toPrev = useSwipe({ direction: 'right', ...turn(prev, -1) });

  useEffect(() => {
    const track = (swipe: typeof toNext, sign: -1 | 1) => [
      swipe.offset.on('change', (offset) => {
        if (moving.current === sign) x.set(-sign * follow(offset));
      }),
      swipe.willCommit.on('change', (will) => {
        if (moving.current === sign) armed.set(will);
      }),
    ];
    const offs = [...track(toNext, 1), ...track(toPrev, -1)];
    return () => offs.forEach((off) => off());
  });

  // A new page starts where it belongs; the view transition carries the old one off.
  useLayoutEffect(() => {
    animation.current?.stop();
    x.jump(0);
    way.jump(0);
    armed.jump(false);
  }, [pathname, x, way, armed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        editable(event.target)
      ) {
        return;
      }
      const to =
        event.key === 'ArrowRight'
          ? next
          : event.key === 'ArrowLeft'
            ? prev
            : undefined;
      if (to === undefined) return;
      event.preventDefault();
      void navigate({ to: to.path });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, next, prev]);

  return { x, way, armed, prev, next };
}
