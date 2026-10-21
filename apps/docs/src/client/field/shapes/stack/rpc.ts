import { Kind } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';
import { TAU, ball, circle, segment, stroke } from '../pen/index.ts';

/*
 * rpc-toolkit: a client and a server, two small globes, joined by a double
 * helix. Calls run along one strand to the server; answers run back along
 * the other. Rungs tie the strands together: one contract, both ends.
 */

const SPAN = 0.54;
const RADIUS = 0.15;
const TURNS = 3;

function strand(offset: number) {
  return (u: number): V3 => {
    const a = u * TURNS * TAU + offset;
    return [-SPAN + u * 2 * SPAN, Math.cos(a) * RADIUS, Math.sin(a) * RADIUS];
  };
}

function globe(c: Cloud, center: V3, radius: number): void {
  const bands = 9;
  for (let k = 0; k < bands; k++) {
    const lat = -Math.PI / 2 + (Math.PI * (k + 0.5)) / bands;
    const y = center[1] + Math.sin(lat) * radius;
    const r = Math.cos(lat) * radius;
    stroke(
      c,
      c.n * 0.017 * Math.cos(lat),
      circle([center[0], y, center[2]], r, 'xz'),
      0.8,
    );
  }
  ball(c, c.n * 0.014, center, radius * 0.3, 1.1);
}

export function rpc(c: Cloud): void {
  const { n } = c;
  globe(c, [-0.8, 0, 0], 0.2);
  globe(c, [0.8, 0, 0], 0.2);

  // Calls go right along one strand, answers come back along the other.
  stroke(
    c,
    n * 0.2,
    strand(0),
    0.75,
    (u) => [Kind.pulse, 0, u, 0.32, 0.03],
    0.004,
  );
  stroke(
    c,
    n * 0.2,
    strand(Math.PI),
    0.75,
    (u) => [Kind.pulse, 0.5, u, -0.32, 0.03],
    0.004,
  );

  const rungs = TURNS * 8;
  for (let k = 1; k < rungs; k++) {
    const u = k / rungs;
    stroke(c, n * 0.0035, segment(strand(0)(u), strand(Math.PI)(u)), 0.32);
  }

  // Where the helix meets each globe, a bright collar.
  stroke(c, n * 0.012, circle([-SPAN - 0.04, 0, 0], RADIUS, 'yz'), 0.9);
  stroke(c, n * 0.012, circle([SPAN + 0.04, 0, 0], RADIUS, 'yz'), 0.9);
}
