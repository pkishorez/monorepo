import type { Frame, Sample, Track } from './types';

type Point = { readonly x: number; readonly y: number };

export const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/** The fields every horizontal gesture reports, from its signed travel. */
export const horizontal = (dx: number, width: number, velocity: number) => ({
  direction: dx < 0 ? ('left' as const) : ('right' as const),
  dx,
  distance: Math.abs(dx),
  progress: width > 0 ? dx / width : 0,
  velocity,
});

/** Where pointer `id` is in this frame, including the one that just lifted. */
export const trackOf = (frame: Frame, id: number): Track | undefined =>
  frame.input?.track.id === id
    ? frame.input.track
    : frame.pointers.find((pointer) => pointer.id === id);

export const elapsed = (frame: Frame, since: Sample): number =>
  frame.t - since.t;
