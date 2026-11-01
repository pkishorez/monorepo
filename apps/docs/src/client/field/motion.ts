/*
 * Whether the reader asked for less motion. Then the field keeps still:
 * no drift, no turning, no pulses; it still
 * changes shape as they scroll, only easing from one to the next.
 */

export type MotionWatch = {
  readonly calm: () => boolean;
  readonly dispose: () => void;
};

export function watchMotion(): MotionWatch {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  let calm = query.matches;
  const change = (e: MediaQueryListEvent) => {
    calm = e.matches;
  };
  query.addEventListener('change', change);
  return {
    calm: () => calm,
    dispose: () => query.removeEventListener('change', change),
  };
}
