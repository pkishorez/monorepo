import {
  Kind,
  STORY,
  arrow,
  ball,
  bend,
  loopOf,
  ring,
  windowOf,
} from '../pen/index.ts';
import type { Clock, Cloud, Label, Motion, V3 } from '../pen/index.ts';

/*
 * states: what runs is decided by the state. Idle, Loading and Ready in a
 * row; Open takes Idle to Loading, Loaded takes Loading to Ready, and Close
 * goes back round to Idle. Each takes its turn as the current state, bright
 * while the others dim. What a state runs exists only while it is current:
 * Loading's Workers and Ready's Profile child gather round it as it begins
 * and drift away as it ends.
 */

const X = [-0.64, 0, 0.64];
const R = 0.15;
const TURN = 1 / 3;
const NAMES = ['Idle', 'Loading', 'Ready'];

/** How current state `k` is now, 0..1: the same window the shader lights. */
export const current = (clock: Clock, k: number): number =>
  windowOf(loopOf(clock), k * TURN, TURN, 0.06);

const lit = (k: number): Motion => [Kind.cycle, 0, k * TURN, TURN, STORY];

/** What a state runs: satellites, `count` of them, `size` each. */
function runs(c: Cloud, k: number, count: number, size: number): void {
  const { n, random } = c;
  for (let s = 0; s < count; s++) {
    const phase = s / count;
    for (let p = 0; p < n * 0.004 * size; p++) {
      const a = random() * Math.PI * 2;
      const r = 0.016 * size * Math.sqrt(random());
      c.add([X[k]! + Math.cos(a) * r, Math.sin(a) * r, 0], 1.3, [
        Kind.satellite,
        phase,
        R + 0.1,
        k * TURN,
        TURN,
      ]);
    }
  }
}

export function states(c: Cloud): void {
  const { n } = c;
  X.forEach((x, k) => {
    const at: V3 = [x, 0, 0];
    ring(c, at, R, 1, () => lit(k));
    ring(c, at, R * 0.55, 0.4, () => lit(k));
    ball(c, n * 0.003, at, 0.016, 1.4, lit(k));
  });
  runs(c, 1, 3, 1);
  runs(c, 2, 1, 1.8);

  // Open and Loaded over the top, Close back underneath.
  for (let k = 0; k < 2; k++) {
    const from: V3 = [X[k]! + R + 0.03, 0.06, 0];
    const to: V3 = [X[k + 1]! - R - 0.03, 0.06, 0];
    arrow(
      c,
      bend(from, [(from[0] + to[0]) / 2, 0.28, 0], to),
      0.4,
      0.6,
      (u) => [Kind.pulse, 0, (k + 1) * TURN - 0.05 + u * 0.05, 1 / STORY, 0.03],
    );
  }
  arrow(
    c,
    bend([X[2]!, -R - 0.04, 0], [0, -0.72, 0], [X[0]!, -R - 0.04, 0]),
    1.5,
    0.45,
    (u) => [Kind.pulse, 0, 0.95 + u * 0.05, 1 / STORY, 0.03],
  );
}

export const statesLabels: readonly Label[] = [
  ...NAMES.map((text, k): Label => ({
    text,
    at: [X[k]!, -R - 0.12, 0],
    lit: (clock) => current(clock, k) > 0.5,
  })),
  {
    text: 'Worker',
    at: [X[1]!, R + 0.2, 0],
    show: (clock) => current(clock, 1),
  },
  {
    text: 'Profile',
    at: [X[2]!, R + 0.2, 0],
    show: (clock) => current(clock, 2),
  },
  { text: 'Open', kind: 'message', at: [(X[0]! + X[1]!) / 2, 0.33, 0] },
  { text: 'Loaded', kind: 'message', at: [(X[1]! + X[2]!) / 2, 0.33, 0] },
  { text: 'Close', kind: 'message', at: [0, -0.56, 0] },
];
