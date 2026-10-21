import { Kind, STORY } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';
import { TAU, ball, bend, circle, stroke } from '../pen/index.ts';

/*
 * states: what runs is decided by the state. Three states in a row, Idle,
 * Loading and Ready, joined by the transitions between them and one back
 * round to the start. Each takes its turn as the current state and
 * brightens; only the current state has work running, small satellites
 * that gather round it as it begins and drift away as it ends.
 */

const X = [-0.64, 0, 0.64];
const R = 0.19;
const TURN = 1 / 3;

export function states(c: Cloud): void {
  const { n, random } = c;

  X.forEach((x, k) => {
    const at: V3 = [x, 0, 0];
    const lit = (): readonly [number, number, number, number, number] => [
      Kind.cycle,
      0,
      k * TURN,
      TURN,
      STORY,
    ];
    // Idle a whole ring; Loading a ring with a gap; Ready a ring with a heart.
    const to = k === 1 ? TAU * 0.8 : TAU;
    stroke(c, n * 0.07, circle(at, R, 'xy', 0.4, 0.4 + to), 0.9, lit);
    stroke(c, n * 0.02, circle(at, R * 0.62, 'xy'), 0.35, lit);
    if (k === 2) ball(c, n * 0.012, at, 0.035, 1.2, lit());

    // The work that runs only in this state: six satellites.
    for (let s = 0; s < 6; s++) {
      const phase = s / 6 + random() * 0.05;
      const radius = R + 0.08 + random() * 0.06;
      for (let p = 0; p < n * 0.005; p++) {
        c.add([x + (random() - 0.5) * 0.02, (random() - 0.5) * 0.02, 0], 1.4, [
          Kind.satellite,
          phase,
          radius,
          k * TURN,
          TURN,
        ]);
      }
    }
  });

  // Transitions: over the top from each state to the next, and the long
  // way back underneath; a pulse runs each as the turn passes.
  for (let k = 0; k < 2; k++) {
    const a: V3 = [X[k]! + R * 0.7, R * 0.75, 0];
    const b: V3 = [X[k + 1]! - R * 0.7, R * 0.75, 0];
    const via: V3 = [(a[0] + b[0]) / 2, 0.42, 0];
    stroke(c, n * 0.05, bend(a, via, b), 0.45, (u) => [
      Kind.pulse,
      0,
      (k + 1) * TURN - 0.04 + u * 0.06,
      1 / STORY,
      0.03,
    ]);
  }
  stroke(
    c,
    n * 0.09,
    bend([X[2]!, -R - 0.03, 0], [0, -0.78, 0], [X[0]!, -R - 0.03, 0]),
    0.3,
    (u) => [Kind.pulse, 0, 0.96 + u * 0.06, 1 / STORY, 0.03],
  );
}
