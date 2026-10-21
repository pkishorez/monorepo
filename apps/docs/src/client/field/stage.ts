import type { Chapter } from './chapters.ts';
import type { Pose } from './painter.ts';
import type { Spot } from './placement.ts';
import { blendOf } from './scroll.ts';
import { lookOf } from './shapes/index.ts';
import type { ShapeName } from './shapes/index.ts';

/*
 * The Stage turns where the reader is into the two shapes to draw: the one
 * being left and the one being reached, each placed on its spot and turned
 * by its Look and the clock, and how far the morph between them has gone.
 */

export type Scene = {
  readonly a: Pose;
  readonly b: Pose;
  readonly blend: number;
};

/** Field of view: tan(fov/2) = 1/distance, so depth 0 spans the screen. */
export const DISTANCE = 3.2;

const turns = [new Float32Array(9), new Float32Array(9)] as const;

/** Writes Rz(roll) · Rx(tilt) · Ry(yaw) into `out`, column by column. */
function turn(
  out: Float32Array,
  yaw: number,
  tilt: number,
  roll: number,
): Float32Array {
  const [cy, sy] = [Math.cos(yaw), Math.sin(yaw)];
  const [cx, sx] = [Math.cos(tilt), Math.sin(tilt)];
  const [cz, sz] = [Math.cos(roll), Math.sin(roll)];
  // Rx · Ry
  const m = [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy];
  // Rz · (Rx · Ry), column by column.
  for (let c = 0; c < 3; c++) {
    const x = m[c * 3]!;
    const y = m[c * 3 + 1]!;
    out[c * 3] = cz * x - sz * y;
    out[c * 3 + 1] = sz * x + cz * y;
    out[c * 3 + 2] = m[c * 3 + 2]!;
  }
  return out;
}

export function scene(input: {
  readonly chapters: readonly Chapter[];
  readonly spots: readonly Spot[];
  readonly t: number;
  readonly time: number;
  /** The shapes baked for this page, by layer. */
  readonly cast: readonly ShapeName[];
  /** Which layers are baked yet; others stand in as the first. */
  readonly ready: readonly boolean[];
  /** Small turns from the pointer: [yaw, tilt]. */
  readonly lean: readonly [number, number];
  /** How bright the comet is, 0..1. */
  readonly comet: number;
}): Scene {
  const { chapters, spots, t, time, cast, ready, lean, comet } = input;
  const last = chapters.length - 1;
  const from = Math.min(Math.floor(t), last);
  const to = Math.min(from + 1, last);
  const f = Math.min(Math.max(t - from, 0), 1);

  const pose = (k: number, slot: 0 | 1, glow: number): Pose => {
    const chapter = chapters[k]!;
    const spot = spots[k]!;
    const look = lookOf(chapter.shape);
    const index = cast.indexOf(chapter.shape);
    const yaw =
      look.spin * time + look.sway * Math.sin(time * 0.23 + k) + lean[0];
    return {
      layer: index >= 0 && ready[index] ? index : 0,
      turn: turn(turns[slot], yaw, look.tilt + lean[1], look.roll),
      center: [spot.x, spot.y, 0],
      scale: spot.scale,
      tint: look.tint,
      glow,
    };
  };

  // A shape lights up as the comet arrives, and dims as it leaves.
  const bell = (d: number) => comet * Math.max(0, 1 - d / 0.3) ** 2;
  return {
    a: pose(from, 0, bell(f)),
    b: pose(to, 1, bell(1 - f)),
    blend: blendOf(f),
  };
}
