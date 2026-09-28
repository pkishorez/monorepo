import { Easing, interpolate } from 'remotion';

export const fps = 24;

// Arrivals settle; camera moves and exits glide (ease in and out).
export const settle = Easing.bezier(0.16, 1, 0.3, 1);
export const glide = Easing.bezier(0.65, 0, 0.35, 1);

// 0 → 1 over `seconds`, starting at frame `start`.
export function ease(
  frame: number,
  start: number,
  seconds = 0.7,
  easing = settle,
) {
  if (!Number.isFinite(start)) return 0;
  return interpolate(frame, [start, start + seconds * fps], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// Visible between `enter` and `exit`, fading both ways.
export function visible(
  frame: number,
  enter: number,
  exit = Infinity,
  seconds = 0.5,
) {
  return ease(frame, enter, seconds) * (1 - ease(frame, exit, seconds, glide));
}
