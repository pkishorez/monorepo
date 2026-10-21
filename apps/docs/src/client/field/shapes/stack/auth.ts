import { Kind } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';
import {
  TAU,
  circle,
  lattice,
  roundRect,
  segment,
  stroke,
} from '../pen/index.ts';

/*
 * auth-toolkit: a gate. A padlock at the centre, its keyhole cut clean, and
 * round it the rings of a dial turning slowly, one each way: who you are,
 * checked at every turn.
 */

const BODY_W = 0.5;
const BODY_H = 0.4;
const BODY_Y = -0.12;

/** The keyhole, in the body's own unit square (x, y in -0.5..0.5). */
function inKeyhole(x: number, y: number): boolean {
  const px = x * BODY_W;
  const py = y * BODY_H;
  const head = Math.hypot(px, py - 0.04) < 0.062;
  const slot = Math.abs(px) < 0.026 && py < 0.04 && py > -0.12;
  return head || slot;
}

function shackle(u: number): V3 {
  // Up the left leg, over the arc, down the right leg, all by length.
  const r = 0.16;
  const leg = 0.12;
  const arc = Math.PI * r;
  const total = leg * 2 + arc;
  const top = BODY_Y + BODY_H / 2;
  let d = u * total;
  if (d < leg) return [-r, top + d, 0];
  d -= leg;
  if (d < arc) {
    const a = Math.PI - d / r;
    return [Math.cos(a) * r, top + leg + Math.sin(a) * r, 0];
  }
  d -= arc;
  return [r, top + leg - d, 0];
}

export function auth(c: Cloud): void {
  const { n, random } = c;
  const body: V3 = [0, BODY_Y, 0];

  // The body: two faces, and a fine fill with the keyhole left out.
  for (const z of [-0.035, 0.035]) {
    stroke(c, n * 0.05, roundRect([0, BODY_Y, z], BODY_W, BODY_H, 0.05), 1.05);
  }
  lattice(
    c,
    n * 0.13,
    body,
    BODY_W * 0.9,
    BODY_H * 0.86,
    0.42,
    (x, y) => !inKeyhole(x / 0.9, y / 0.86),
  );
  stroke(
    c,
    n * 0.02,
    circle([0, BODY_Y + 0.04, 0.035], 0.062, 'xy', -1.2, Math.PI + 1.2),
    1.5,
  );
  stroke(
    c,
    n * 0.006,
    segment([-0.026, BODY_Y - 0.12, 0.035], [-0.026, BODY_Y - 0.015, 0.035]),
    1.5,
  );
  stroke(
    c,
    n * 0.006,
    segment([0.026, BODY_Y - 0.12, 0.035], [0.026, BODY_Y - 0.015, 0.035]),
    1.5,
  );
  stroke(
    c,
    n * 0.003,
    segment([-0.026, BODY_Y - 0.12, 0.035], [0.026, BODY_Y - 0.12, 0.035]),
    1.5,
  );
  stroke(c, n * 0.07, shackle, 0.95, undefined, 0.01);

  // The dial: a dashed ring one way, a ticked ring the other, a dotted rim.
  const inner = 0.6;
  for (let k = 0; k < n * 0.12; k++) {
    const dash = Math.floor(random() * 16);
    const a = ((dash + random() * 0.7) / 16) * TAU;
    c.add([Math.cos(a) * inner, Math.sin(a) * inner, 0], 0.8, [
      Kind.orbit,
      0,
      0.11,
      0,
      0,
    ]);
  }
  const outer = 0.76;
  stroke(c, n * 0.08, circle([0, 0, 0], outer, 'xy'), 0.55, () => [
    Kind.orbit,
    0,
    -0.06,
    0,
    0,
  ]);
  const ticks = 72;
  for (let t = 0; t < ticks; t++) {
    const a = (t / ticks) * TAU;
    const long = t % 6 === 0 ? 0.07 : 0.035;
    const from: V3 = [Math.cos(a) * outer, Math.sin(a) * outer, 0];
    const to: V3 = [
      Math.cos(a) * (outer + long),
      Math.sin(a) * (outer + long),
      0,
    ];
    stroke(
      c,
      n * (t % 6 === 0 ? 0.0012 : 0.0006),
      segment(from, to),
      0.9,
      () => [Kind.orbit, 0, -0.06, 0, 0],
    );
  }
  for (let k = 0; k < 180; k++) {
    const a = (k / 180) * TAU;
    c.add([Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0], 0.6);
  }
}
