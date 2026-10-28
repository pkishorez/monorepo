import { Kind } from '../pen/index.ts';
import type { Cloud, Motion, V3 } from '../pen/index.ts';
import { ball, circle, roundRect, segment, stroke } from '../pen/index.ts';

/*
 * mark: kabuki's logo in points, drawn as fine as everything else: a root
 * and two children, each a thin ring round a small bright heart, joined by
 * clean lines that stop at the rings, inside a faint rounded square, all
 * breathing slowly. Placed from the same 20 by 20 drawing as the logo in
 * the header.
 */

const BREATHE: Motion = [Kind.breathe, 0, 0.025, 0, 0];

/** A point of the logo's 20 × 20 drawing, centred, y up, in -1..1. */
const at = (x: number, y: number): V3 => [(x - 10) / 8, -(y - 10) / 8, 0];

const ROOT = { x: 10, y: 5.5, r: 2 };
const KIDS = [
  { x: 5.5, y: 14, r: 1.8 },
  { x: 14.5, y: 14, r: 1.8 },
];
const JOIN = { x: 10, y: 9.5 };

function node(c: Cloud, x: number, y: number, r: number): void {
  const { n } = c;
  const center = at(x, y);
  const radius = r / 8;
  stroke(c, n * 0.09 * r, circle(center, radius, 'xy'), 0.85, () => BREATHE);
  stroke(
    c,
    n * 0.03 * r,
    circle(center, radius * 0.55, 'xy'),
    0.3,
    () => BREATHE,
  );
  ball(c, n * 0.006 * r, center, 0.022, 1.5, BREATHE);
}

/** A line from `from` towards a node, stopping at its ring. */
function toRing(c: Cloud, from: V3, x: number, y: number, r: number): void {
  const to = at(x, y);
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  const stop = r / 8 + 0.03;
  const end: V3 = [to[0] - (dx / len) * stop, to[1] - (dy / len) * stop, 0];
  stroke(
    c,
    c.n * 0.12 * (len - stop),
    segment(from, end),
    0.8,
    () => BREATHE,
    0.003,
  );
}

export function mark(c: Cloud): void {
  node(c, ROOT.x, ROOT.y, ROOT.r);
  for (const kid of KIDS) node(c, kid.x, kid.y, kid.r);

  const join = at(JOIN.x, JOIN.y);
  const below = at(ROOT.x, ROOT.y + ROOT.r);
  stroke(
    c,
    c.n * 0.12 * (below[1] - join[1] - 0.03),
    segment([below[0], below[1] - 0.03, 0], join),
    0.8,
    () => BREATHE,
    0.003,
  );
  for (const kid of KIDS) toRing(c, join, kid.x, kid.y, kid.r);

  // The rounded square it sits in, faint.
  stroke(c, c.n * 0.07, roundRect([0, 0, 0], 2, 2, 0.5), 0.22, () => BREATHE);
}
