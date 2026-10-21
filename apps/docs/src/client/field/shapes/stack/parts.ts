import { Kind, moved } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';
import {
  TAU,
  add3,
  ball,
  circle,
  roundRect,
  segment,
  stroke,
} from '../pen/index.ts';

/*
 * The small packages, five little figures round a ring: a key cap
 * (use-keys), a touch rippling out (use-gesture), a hook (use-effect-ts),
 * two peers linked (effect-webrtc) and a dotted trace (effect-tracer).
 */

function keyCap(c: Cloud): void {
  const { n } = c;
  stroke(c, n * 0.05, roundRect([0, 0, -0.05], 0.3, 0.3, 0.04), 0.8);
  stroke(c, n * 0.04, roundRect([0, 0.025, 0.05], 0.21, 0.21, 0.035), 1.15);
  for (const [x, y] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    stroke(
      c,
      n * 0.003,
      segment(
        [x * 0.135, y * 0.135, -0.05],
        [x * 0.09, y * 0.09 + 0.025, 0.05],
      ),
      0.6,
    );
  }
  ball(c, n * 0.004, [0, 0.025, 0.05], 0.02, 1.8);
}

function touch(c: Cloud): void {
  const { n } = c;
  ball(c, n * 0.012, [0, 0, 0], 0.03, 1.8);
  [0.07, 0.13, 0.19].forEach((r, k) => {
    stroke(c, n * 0.035 * (r / 0.13), circle([0, 0, 0], r, 'xy'), 0.7, () => [
      Kind.pulse,
      0,
      k / 4,
      0.45,
      0.09,
    ]);
  });
}

function hook(c: Cloud): void {
  const { n } = c;
  stroke(
    c,
    n * 0.025,
    segment([0.07, 0.17, 0], [0.07, -0.06, 0]),
    1,
    undefined,
    0.006,
  );
  stroke(
    c,
    n * 0.03,
    circle([-0.015, -0.06, 0], 0.085, 'xy', 0, -Math.PI),
    1,
    undefined,
    0.006,
  );
  stroke(
    c,
    n * 0.008,
    segment([-0.1, -0.06, 0], [-0.1, -0.01, 0]),
    1,
    undefined,
    0.006,
  );
  stroke(c, n * 0.014, circle([0.07, 0.205, 0], 0.035, 'xy'), 1.2);
}

function peers(c: Cloud): void {
  const { n } = c;
  for (const x of [-0.16, 0.16]) {
    ball(c, n * 0.014, [x, 0, 0], 0.035, 1.7);
    stroke(c, n * 0.01, circle([x, 0, 0], 0.07, 'xy'), 0.6);
  }
  stroke(
    c,
    n * 0.016,
    segment([-0.09, 0.012, 0], [0.09, 0.012, 0]),
    0.6,
    (u) => [Kind.pulse, 0, u, 0.5, 0.08],
  );
  stroke(
    c,
    n * 0.016,
    segment([-0.09, -0.012, 0], [0.09, -0.012, 0]),
    0.6,
    (u) => [Kind.pulse, 0.5, u, -0.5, 0.08],
  );
}

function trace(c: Cloud): void {
  const { n } = c;
  const line = (u: number): V3 => [
    -0.2 + u * 0.4,
    Math.sin(u * TAU * 1.25) * 0.05,
    0,
  ];
  stroke(c, n * 0.045, line, 0.6, (u) => [Kind.pulse, 0, u, 0.3, 0.06]);
  for (let k = 0; k <= 4; k++) {
    ball(c, n * 0.004, line(k / 4), 0.016, 1.8);
  }
}

export function parts(c: Cloud): void {
  const figures = [keyCap, touch, hook, peers, trace];
  figures.forEach((draw, k) => {
    const a = Math.PI / 2 + (k / figures.length) * TAU;
    const center: V3 = [Math.cos(a) * 0.62, Math.sin(a) * 0.62 - 0.04, 0];
    draw(
      moved(c, (p) => add3(center, [p[0] * 1.15, p[1] * 1.15, p[2] * 1.15])),
    );
  });
  // A faint ring through them: one family.
  stroke(c, c.n * 0.06, circle([0, -0.04, 0], 0.62, 'xy'), 0.12);
}
