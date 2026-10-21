import { Kind } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';
import { ball, bend, circle, shell, stroke } from '../pen/index.ts';

/*
 * lineage: what kabuki grew from. Six ideas round the left, Elm, Foldkit,
 * statecharts, the actor model, Effect and React, each sending a stream
 * that bends in towards one bright node on the right: kabuki.
 */

const SOURCES: ReadonlyArray<readonly [x: number, y: number, size: number]> = [
  [-0.62, 0.78, 1],
  [-0.86, 0.42, 0.75],
  [-0.92, 0.02, 1.1],
  [-0.84, -0.38, 0.85],
  [-0.6, -0.74, 1],
  [-0.22, -0.92, 0.7],
];
const HOME: V3 = [0.62, -0.02, 0];

export function lineage(c: Cloud): void {
  const { n, random } = c;
  SOURCES.forEach(([x, y, size], k) => {
    const at: V3 = [x, y, (k % 2 ? -1 : 1) * 0.08];
    ball(c, n * 0.012 * size, at, 0.035 * size, 1.1);
    stroke(c, n * 0.012 * size, circle(at, 0.075 * size, 'xy'), 0.6);
    // Its stream: bending in, a few pulses on the way.
    const via: V3 = [0.05, y * 0.35, 0];
    const phase = random();
    stroke(
      c,
      n * 0.075,
      bend(at, via, HOME),
      0.32,
      (u) => [Kind.pulse, phase, u, 0.18, 0.05],
      0.004,
    );
  });
  // kabuki: where they meet, brightest.
  ball(c, n * 0.04, HOME, 0.07, 1.3);
  stroke(c, n * 0.03, circle(HOME, 0.14, 'xy'), 0.9);
  shell(c, n * 0.025, HOME, 0.24, 0.3);
  stroke(c, n * 0.02, circle(HOME, 0.34, 'xy'), 0.25, () => [
    Kind.orbit,
    0,
    0.1,
    0,
    0,
  ]);
}
