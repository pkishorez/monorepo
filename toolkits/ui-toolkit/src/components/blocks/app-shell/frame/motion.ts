import { useSidebar as useSwipeSidebar } from '@kstackz/use-gesture';
import { animate, type MotionValue, motionValue } from 'motion/react';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { MOBILE_QUERY } from '#hooks/use-mobile';

/** How far a phone's sidebar opens, in px: the `18rem` of `--sidebar-width-mobile`. */
const PHONE_SIDEBAR_WIDTH = 288;
/** The strip along the left edge that opens it, when swipes open from the edge. */
const EDGE = 24;
const TOUCH_QUERY = '(pointer: coarse)';
const MOBILE_SPRING = {
  type: 'spring',
  visualDuration: 0.3,
  bounce: 0,
} as const;

const watch = (query: string, onChange: () => void) => {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

function useIsTouch() {
  return useSyncExternalStore(
    useCallback((onChange: () => void) => watch(TOUCH_QUERY, onChange), []),
    () => window.matchMedia(TOUCH_QUERY).matches,
    () => false,
  );
}

/**
 * `open`, 0 shut to 1 open: under a finger on a touch screen, else springing
 * to the open state as it changes. Swipes open from anywhere, from the left
 * edge only, or not at all.
 */
export function useOpenProgress(options: {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly swipe: 'anywhere' | 'edge' | 'off';
}): MotionValue<number> {
  const touch = useIsTouch();
  return useSwipeSidebar({
    side: 'left',
    width: PHONE_SIDEBAR_WIDTH,
    edge: options.swipe === 'edge' ? EDGE : undefined,
    enabled: touch && options.swipe !== 'off',
    open: options.open,
    onOpenChange: options.setOpen,
  }).progress;
}

/**
 * `mobile`, 1 on a phone to 0 wider: springing between the two as the screen
 * crosses the breakpoint, or jumping, for reduced motion. It starts at the
 * screen's real value.
 */
export function useMobileProgress(): MotionValue<number> {
  const [value] = useState(() =>
    motionValue(
      typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
        ? 1
        : 0,
    ),
  );
  // The breakpoint's change event moves the value, through React's store
  // subscription: no effect to keep in step.
  useSyncExternalStore(
    useCallback(
      (onChange: () => void) =>
        watch(MOBILE_QUERY, () => {
          const next = window.matchMedia(MOBILE_QUERY).matches ? 1 : 0;
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            value.jump(next);
          } else {
            animate(value, next, MOBILE_SPRING);
          }
          onChange();
        }),
      [value],
    ),
    () => value,
    () => value,
  );
  return value;
}
