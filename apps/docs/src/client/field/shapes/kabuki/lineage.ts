import { Kind, bend, stroke, node, sec } from '../pen/index.ts';
import type { Cloud, Label, V3 } from '../pen/index.ts';

/*
 * lineage: what inspired kabuki. Six ideas down the left, Elm, Foldkit,
 * statecharts, the actor model, Effect and React, each a quiet point with
 * a hairline bending in to one bright point on the right: kabuki. Top to
 * bottom, one at a time, each idea pops and sends light down its line,
 * easing in and out; kabuki pops as it lands, and the next one goes.
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
/** Seconds between one idea and the next, and the light's run. */
const EVERY = 1.5;
const RUN = 0.9;

const at = (k: number): V3 => [X, 0.7 - (k * 1.4) / (SOURCES.length - 1), 0];

export function lineage(c: Cloud): void {
  const { n } = c;
  SOURCES.forEach((_, k) => {
    const from = at(k);
    node(c, from, 0.6, { at: k * EVERY }, undefined, 0.9);
    const start: V3 = [from[0] + 0.05, from[1], 0];
    const end: V3 = [HOME[0] - 0.08, HOME[1] + from[1] * 0.06, 0];
    stroke(
      c,
      n * 0.024 * 1.25,
      bend(start, [0.15, from[1] * 0.85, 0], end),
      0.3,
      (u) => [Kind.stream, sec(k * EVERY), u, sec(RUN), 1],
      0.0015,
    );
  });
  node(c, HOME, 1.8, { at: RUN, repeats: SOURCES.length });
}

export const lineageLabels: readonly Label[] = [
  { text: 'kabuki', at: [HOME[0], HOME[1] - 0.14, 0] },
  ...SOURCES.map((text, k): Label => ({
    text,
    at: [X - 0.06 - text.length * 0.018, at(k)[1], 0],
  })),
];
