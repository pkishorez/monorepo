import { Kind } from '../pen/index.ts';
import type { Cloud, Motion, V3 } from '../pen/index.ts';
import { ball, circle, stroke } from '../pen/index.ts';
import type { Path } from '../pen/index.ts';

/*
 * compose: Actors made of Actors. A root, three children, a few
 * grandchildren, drawn like an org chart, each Actor a ring with a smaller
 * one inside it. One branch lives only while its parent is in a state: it
 * grows in, holds, and dissolves, over and over.
 */

const ROOT: V3 = [0, 0.7, 0];
const KIDS: V3[] = [
  [-0.62, 0.02, 0],
  [0.04, 0.02, 0],
  [0.68, 0.02, 0],
];
const LOW = -0.64;

/** Down, across, down: a tree's elbow from `a` to `b`, evenly by length. */
function elbow(a: V3, b: V3, gap: number): Path {
  const mid = (a[1] + b[1]) / 2;
  const points: V3[] = [
    [a[0], a[1] - gap, a[2]],
    [a[0], mid, a[2]],
    [b[0], mid, b[2]],
    [b[0], b[1] + gap, b[2]],
  ];
  const lengths = points
    .slice(1)
    .map(
      (p, k) => Math.abs(p[0] - points[k]![0]) + Math.abs(p[1] - points[k]![1]),
    );
  const total = lengths.reduce((s, l) => s + l, 0);
  return (u) => {
    let d = u * total;
    for (let k = 0; k < lengths.length; k++) {
      const l = lengths[k]!;
      if (d <= l || k === lengths.length - 1) {
        const f = l > 0 ? Math.min(d / l, 1) : 0;
        const p = points[k]!;
        const q = points[k + 1]!;
        return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2]];
      }
      d -= l;
    }
    return points[3]!;
  };
}

/** An Actor: a ring, a ring inside it, a small heart. */
function actor(
  c: Cloud,
  at: V3,
  size: number,
  motion?: (u: number) => Motion,
): void {
  const { n } = c;
  stroke(c, n * 0.03 * size, circle(at, 0.1 * size, 'xy'), 0.9, motion);
  stroke(c, n * 0.016 * size, circle(at, 0.055 * size, 'xy'), 0.6, motion);
  const heart = motion?.(0.5);
  ball(c, n * 0.006 * size, at, 0.022 * size, 1.4, heart);
}

export function compose(c: Cloud): void {
  const { n, random } = c;
  actor(c, ROOT, 1.5);
  // The root holds a ring of its own: one Actor, inside another.
  stroke(c, n * 0.03, circle(ROOT, 0.2, 'xy'), 0.35);
  for (const kid of KIDS) {
    actor(c, kid, 1.05);
    stroke(c, n * 0.04, elbow(ROOT, kid, 0.17), 0.45);
  }

  const kept: Array<readonly [V3, V3]> = [
    [KIDS[0]!, [-0.86, LOW, 0]],
    [KIDS[0]!, [-0.4, LOW, 0]],
    [KIDS[2]!, [0.68, LOW, 0]],
  ];
  for (const [from, to] of kept) {
    actor(c, to, 0.8);
    stroke(c, n * 0.025, elbow(from, to, 0.11), 0.45);
  }

  // The branch that lives in a state: edges drawn in, then its Actors.
  const passing: V3[] = [
    [-0.08, LOW, 0],
    [0.24, LOW, 0],
  ];
  for (const to of passing) {
    stroke(c, n * 0.03, elbow(KIDS[1]!, to, 0.11), 0.6, (u) => [
      Kind.reveal,
      0.06,
      u,
      0.1,
      0.2,
    ]);
    actor(c, to, 0.8, () => [Kind.reveal, 0.05, random(), 0.3, 0.1]);
  }
}
