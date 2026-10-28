import { Kind, ball, bend, ring, stroke } from '../pen/index.ts';
import type { Cloud, Label, V3 } from '../pen/index.ts';

/*
 * lineage: what kabuki grew from. Six ideas down the left, Elm, Foldkit,
 * statecharts, the actor model, Effect and React, each a curve bending in
 * to one node on the right: kabuki, where they meet.
 */

const SOURCES = [
  'Elm',
  'Foldkit',
  'statecharts',
  'actor model',
  'Effect',
  'React',
];
const X = -0.5;
const HOME: V3 = [0.62, 0, 0];

const at = (k: number): V3 => [X, 0.72 - (k * 1.44) / (SOURCES.length - 1), 0];

export function lineage(c: Cloud): void {
  const { n } = c;
  SOURCES.forEach((_, k) => {
    const from = at(k);
    ring(c, from, 0.035, 0.9);
    ball(c, n * 0.002, from, 0.01, 1.3);
    const start: V3 = [from[0] + 0.05, from[1], 0];
    const end: V3 = [HOME[0] - 0.13, HOME[1] + from[1] * 0.12, 0];
    const path = bend(start, [0.15, from[1] * 0.85, 0], end);
    stroke(
      c,
      n * 0.024 * 1.25,
      path,
      0.45,
      (u) => [Kind.pulse, k / SOURCES.length, u, 0.2, 0.05],
      0.0015,
    );
  });
  ring(c, HOME, 0.1, 1);
  ring(c, HOME, 0.17, 0.35);
  ball(c, n * 0.01, HOME, 0.03, 1.4);
}

export const lineageLabels: readonly Label[] = [
  { text: 'kabuki', at: [HOME[0], HOME[1] - 0.27, 0] },
  ...SOURCES.map((text, k): Label => ({
    text,
    at: [X - 0.08 - text.length * 0.018, at(k)[1], 0],
  })),
];
