import { Kind } from './cloud.ts';
import type { Cloud, Motion, V3 } from './cloud.ts';

/*
 * The strokes every shape is drawn with: paths (a line, an arc, a rounded
 * rectangle) sampled evenly into points, balls and shells of points, a filled
 * lattice, and dust. A path is a function from 0..1 to a place.
 */

export const TAU = Math.PI * 2;

export type Path = (u: number) => V3;

/** A normal random number, mean 0, spread 1. */
export function gauss(random: () => number): number {
  const u = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * random());
}

/** A random direction. */
export function direction(random: () => number): V3 {
  const z = random() * 2 - 1;
  const a = random() * TAU;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
}

export const add3 = (a: V3, b: V3): V3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const sub3 = (a: V3, b: V3): V3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const scale3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const lerp3 = (a: V3, b: V3, u: number): V3 => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u,
  a[2] + (b[2] - a[2]) * u,
];
export const length3 = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

/** Turns a point round the y axis. */
export const turnY = (p: V3, a: number): V3 => [
  p[0] * Math.cos(a) + p[2] * Math.sin(a),
  p[1],
  -p[0] * Math.sin(a) + p[2] * Math.cos(a),
];

/** A straight line from `a` to `b`. */
export const segment =
  (a: V3, b: V3): Path =>
  (u) =>
    lerp3(a, b, u);

/** A curve from `a` to `b`, pulled towards `via`. */
export const bend =
  (a: V3, via: V3, b: V3): Path =>
  (u) =>
    lerp3(lerp3(a, via, u), lerp3(via, b, u), u);

/** A circle, or an arc of one, in the plane named. */
export const circle =
  (
    center: V3,
    r: number,
    plane: 'xy' | 'xz' | 'yz' = 'xy',
    from = 0,
    to = TAU,
  ): Path =>
  (u) => {
    const a = from + (to - from) * u;
    const c = Math.cos(a) * r;
    const s = Math.sin(a) * r;
    if (plane === 'xy') return [center[0] + c, center[1] + s, center[2]];
    if (plane === 'xz') return [center[0] + c, center[1], center[2] + s];
    return [center[0], center[1] + c, center[2] + s];
  };

/** The outline of a rounded rectangle in the xy plane, evenly by length. */
export function roundRect(center: V3, w: number, h: number, r: number): Path {
  const sx = w - 2 * r;
  const sy = h - 2 * r;
  const arc = (Math.PI / 2) * r;
  const total = 2 * sx + 2 * sy + 4 * arc;
  const [cx, cy, cz] = center;
  const hx = sx / 2;
  const hy = sy / 2;
  return (u) => {
    let d = u * total;
    // Bottom, right, top, left, each followed by its corner.
    const legs: Array<[number, (d: number) => V3]> = [
      [sx, (d) => [cx - hx + d, cy - h / 2, cz]],
      [arc, (d) => corner(cx + hx, cy - hy, -Math.PI / 2 + d / r)],
      [sy, (d) => [cx + w / 2, cy - hy + d, cz]],
      [arc, (d) => corner(cx + hx, cy + hy, d / r)],
      [sx, (d) => [cx + hx - d, cy + h / 2, cz]],
      [arc, (d) => corner(cx - hx, cy + hy, Math.PI / 2 + d / r)],
      [sy, (d) => [cx - w / 2, cy + hy - d, cz]],
      [arc, (d) => corner(cx - hx, cy - hy, Math.PI + d / r)],
    ];
    for (const [len, at] of legs) {
      if (d <= len) return at(d);
      d -= len;
    }
    return [cx - hx, cy - h / 2, cz];
  };
  function corner(x: number, y: number, a: number): V3 {
    return [x + Math.cos(a) * r, y + Math.sin(a) * r, cz];
  }
}

/**
 * `count` points evenly along a path, each nudged a little along it so the
 * spacing never reads as a grid, and blurred by `blur` across it.
 */
export function stroke(
  c: Cloud,
  count: number,
  path: Path,
  bright = 1,
  motion?: (u: number) => Motion,
  blur = 0,
): void {
  const n = Math.max(0, Math.round(count));
  for (let k = 0; k < n; k++) {
    const u = (k + c.random()) / n;
    const p = path(u);
    if (blur > 0) {
      p[0] += gauss(c.random) * blur;
      p[1] += gauss(c.random) * blur;
      p[2] += gauss(c.random) * blur;
    }
    c.add(p, bright, motion?.(u));
  }
}

/** A soft ball: dense at its heart, thinning out. */
export function ball(
  c: Cloud,
  count: number,
  center: V3,
  radius: number,
  bright = 1,
  motion?: Motion,
): void {
  for (let k = 0; k < Math.round(count); k++) {
    const d = direction(c.random);
    const r = radius * Math.pow(c.random(), 0.6);
    c.add(add3(center, scale3(d, r)), bright, motion);
  }
}

/** Points on the skin of a sphere. */
export function shell(
  c: Cloud,
  count: number,
  center: V3,
  radius: number,
  bright = 1,
  motion?: Motion,
): void {
  for (let k = 0; k < Math.round(count); k++) {
    c.add(add3(center, scale3(direction(c.random), radius)), bright, motion);
  }
}

/**
 * A rectangle in the xy plane filled with an even lattice of about `count`
 * points; `keep` can leave holes.
 */
export function lattice(
  c: Cloud,
  count: number,
  center: V3,
  w: number,
  h: number,
  bright = 1,
  keep: (x: number, y: number) => boolean = () => true,
  motion?: (x: number, y: number) => Motion,
): void {
  const cols = Math.max(1, Math.round(Math.sqrt((count * w) / h)));
  const rows = Math.max(1, Math.round(count / cols));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) / cols - 0.5;
      const y = (j + 0.5) / rows - 0.5;
      if (!keep(x, y)) continue;
      c.add(
        [center[0] + x * w, center[1] + y * h, center[2]],
        bright,
        motion?.(x + 0.5, y + 0.5),
      );
    }
  }
}

/** Faint glinting dust in a ball round everything. */
export function dust(
  c: Cloud,
  count: number,
  radius: number,
  bright: number,
): void {
  for (let k = 0; k < Math.round(count); k++) {
    const d = direction(c.random);
    const r = radius * (0.35 + 0.65 * Math.cbrt(c.random()));
    c.add(scale3(d, r), bright * (0.5 + c.random()), [
      Kind.twinkle,
      c.random(),
      0.6 + c.random() * 1.6,
      0,
      0,
    ]);
  }
}
