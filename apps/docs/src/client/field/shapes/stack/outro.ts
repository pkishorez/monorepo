import { Kind } from '../pen/index.ts';
import type { Cloud } from '../pen/index.ts';
import { TAU, ball, circle, gauss, stroke } from '../pen/index.ts';

/*
 * The end: everything gathers back into one calm ring round a point of
 * light, turning slowly. A quiet place to stop.
 */

export function outro(c: Cloud): void {
  const { n, random } = c;
  for (let k = 0; k < n * 0.5; k++) {
    const a = random() * TAU;
    const r = 0.4 + gauss(random) * 0.006;
    c.add([Math.cos(a) * r, Math.sin(a) * r, gauss(random) * 0.004], 0.7, [
      Kind.orbit,
      0,
      0.05,
      0,
      0,
    ]);
  }
  stroke(c, n * 0.08, circle([0, 0, 0], 0.56, 'xy'), 0.16);
  ball(c, n * 0.03, [0, 0, 0], 0.018, 1.6);
}
