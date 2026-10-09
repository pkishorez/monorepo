import { fractalNoise } from './noise.js';

/*
 * Which way the flow points at a place and moment: Perlin noise drifting
 * over time, bent into a swirl around the pointer.
 */

/** What the flow depends on besides place and time: the sliders and the pointer. */
export type Field = {
  readonly flowStrength: number;
  readonly noiseScale: number;
  readonly pointer: { readonly x: number; readonly y: number } | null;
};

const SPATIAL_SCALE = 0.0028;
const TIME_SCALE = 0.085;
const DRIFT_X = 12;
const DRIFT_Y = 7;
export const POINTER_RADIUS = 130;
const POINTER_RADIAL_BIAS = -0.4;

/** Blend two angles as unit vectors, `t` of the way from `a` to `b`. */
export const blend = (a: number, b: number, t: number) => {
  const x = Math.cos(a) + (Math.cos(b) - Math.cos(a)) * t;
  const y = Math.sin(a) + (Math.sin(b) - Math.sin(a)) * t;
  return Math.atan2(y, x);
};

/** The flow's angle at `x, y`, `seconds` into the clock. */
export const angleAt = (
  field: Field,
  x: number,
  y: number,
  seconds: number,
) => {
  const scale = SPATIAL_SCALE * field.noiseScale;
  const noise = fractalNoise(
    (x + seconds * DRIFT_X) * scale + seconds * TIME_SCALE,
    (y + seconds * DRIFT_Y) * scale,
    3,
    0.5,
    2,
  );
  const angle = noise * Math.PI * 2 * field.flowStrength;
  if (!field.pointer) return angle;
  const dx = x - field.pointer.x;
  const dy = y - field.pointer.y;
  const distance = Math.hypot(dx, dy);
  if (distance > POINTER_RADIUS) return angle;
  const away = Math.atan2(dy, dx);
  const swirl = blend(away + Math.PI / 2, away, POINTER_RADIAL_BIAS);
  return blend(angle, swirl, 1 - distance / POINTER_RADIUS);
};
