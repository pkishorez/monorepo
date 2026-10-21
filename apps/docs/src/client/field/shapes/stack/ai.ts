import { Kind } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';
import { TAU, ball, circle, stroke } from '../pen/index.ts';

/*
 * ai-toolkit: the agent's loop. A knot that never ends, model to tools and
 * back, with a bright thought running round it; the model at its heart and
 * the harness a thin ring round the lot.
 */

function knot(u: number): V3 {
  const a = u * TAU;
  const r = (Math.cos(3 * a) + 2.4) * 0.25;
  return [Math.cos(2 * a) * r, Math.sin(2 * a) * r, -Math.sin(3 * a) * 0.25];
}

export function ai(c: Cloud): void {
  const { n } = c;
  // The loop, with one thought ahead and a fainter one behind it.
  stroke(c, n * 0.5, knot, 0.75, (u) => [Kind.pulse, 0, u, 0.06, 0.022], 0.006);
  stroke(c, n * 0.1, knot, 0.35, (u) => [Kind.pulse, 0.5, u, 0.06, 0.04], 0.02);
  ball(c, n * 0.012, [0, 0, 0], 0.05, 1);
  stroke(c, n * 0.07, circle([0, 0, 0], 0.98, 'xy'), 0.45, () => [
    Kind.orbit,
    0,
    0.05,
    0,
    0,
  ]);
}
