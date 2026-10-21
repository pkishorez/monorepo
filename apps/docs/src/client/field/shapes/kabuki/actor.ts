import { Kind } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';
import { ball, circle, roundRect, segment, stroke } from '../pen/index.ts';

/*
 * actor: the building block. An Actor's Model, a dense core ringed by its
 * state, above the View it draws, a flat panel. A loop joins them:
 * Messages climb from the View to the Actor on the left, and the update
 * flows back down to the View on the right.
 */

const CORE: V3 = [0, 0.42, 0];
const VIEW: V3 = [0, -0.46, 0];

/** The loop, from the View's left, up round the Actor, down to its right. */
function side(from: number, to: number) {
  return (u: number): V3 => {
    const a = from + (to - from) * u;
    return [Math.cos(a) * 0.66, 0.07 + Math.sin(a) * 0.36, 0];
  };
}

/** A small chevron at `at`, pointing up or down. */
function chevron(c: Cloud, at: V3, up: boolean): void {
  const tip: V3 = [at[0], at[1] + (up ? 0.035 : -0.035), at[2]];
  for (const dx of [-0.04, 0.04]) {
    const base: V3 = [at[0] + dx, at[1] + (up ? -0.02 : 0.02), at[2]];
    stroke(c, c.n * 0.0025, segment(base, tip), 1.2);
  }
}

export function actor(c: Cloud): void {
  const { n } = c;

  // The Model: a dense core, its state ring, a bead riding the ring.
  ball(c, n * 0.05, CORE, 0.09, 1);
  stroke(c, n * 0.035, circle(CORE, 0.17, 'xz'), 0.8);
  ball(c, n * 0.004, [CORE[0] + 0.17, CORE[1], CORE[2]], 0.014, 1.8, [
    Kind.orbit,
    0,
    0.6,
    0,
    0,
  ]);

  // The View: a panel with a heading, lines, a button.
  stroke(c, n * 0.08, roundRect(VIEW, 0.78, 0.36, 0.04), 1);
  const left = VIEW[0] - 0.31;
  stroke(
    c,
    n * 0.012,
    segment([left, VIEW[1] + 0.09, 0], [left + 0.3, VIEW[1] + 0.09, 0]),
    1.2,
  );
  for (const [y, w] of [
    [0.02, 0.56],
    [-0.035, 0.44],
  ] as const) {
    stroke(
      c,
      n * 0.012,
      segment([left, VIEW[1] + y, 0], [left + w, VIEW[1] + y, 0]),
      0.5,
    );
  }
  stroke(
    c,
    n * 0.02,
    roundRect([VIEW[0] + 0.22, VIEW[1] - 0.1, 0], 0.18, 0.07, 0.03),
    0.9,
  );

  // The loop: Messages up the left, small and quick; the update down the
  // right, one broad wave.
  const up = side(-Math.PI * 0.62, -Math.PI * 1.38);
  const down = side(Math.PI * 0.38, -Math.PI * 0.38);
  for (const phase of [0, 0.33, 0.66]) {
    stroke(
      c,
      n * 0.07,
      up,
      0.5,
      (u) => [Kind.pulse, phase, u, 0.45, 0.035],
      0.003,
    );
  }
  stroke(
    c,
    n * 0.12,
    down,
    0.55,
    (u) => [Kind.pulse, 0.2, u, 0.3, 0.09],
    0.003,
  );
  chevron(c, up(0.5), true);
  chevron(c, down(0.5), false);
}
