import { Kind } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';
import { ball, circle, segment, stroke } from '../pen/index.ts';

/*
 * laymos: architecture rules. Four layers stacked like floors, each holding
 * a few modules, and edges between them that only ever run down: a module
 * may lean on the layer below, never the one above.
 */

const LAYERS = [0.6, 0.2, -0.2, -0.6];
const SIZE = 1.25;

/** Modules on each layer, as places on its floor (x, z). */
const MODULES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [-0.25, 0.1],
    [0.28, -0.15],
  ],
  [
    [-0.38, -0.2],
    [0.05, 0.25],
    [0.36, -0.05],
  ],
  [
    [-0.3, 0.22],
    [0.0, -0.3],
    [0.32, 0.18],
  ],
  [
    [-0.12, 0.02],
    [0.3, -0.25],
  ],
];

/** Which module leans on which, always one layer down: [layer, from, to]. */
const EDGES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [0, 0, 1],
  [0, 1, 2],
  [1, 0, 0],
  [1, 1, 0],
  [1, 1, 2],
  [1, 2, 1],
  [2, 0, 0],
  [2, 1, 1],
  [2, 2, 1],
];

const module = (layer: number, k: number): V3 => {
  const [x, z] = MODULES[layer]![k]!;
  return [x, LAYERS[layer]!, z];
};

export function laymos(c: Cloud): void {
  const { n } = c;
  const half = SIZE / 2;

  for (const y of LAYERS) {
    // The floor: its edge, and a fine grid across it.
    const corners: V3[] = [
      [-half, y, -half],
      [half, y, -half],
      [half, y, half],
      [-half, y, half],
    ];
    corners.forEach((a, k) => {
      stroke(c, n * 0.012, segment(a, corners[(k + 1) % 4]!), 0.75);
    });
    for (let g = 1; g < 6; g++) {
      const t = -half + (g / 6) * SIZE;
      stroke(c, n * 0.0045, segment([t, y, -half], [t, y, half]), 0.2);
      stroke(c, n * 0.0045, segment([-half, y, t], [half, y, t]), 0.2);
    }
  }

  MODULES.forEach((mods, layer) => {
    mods.forEach((_, k) => {
      const at = module(layer, k);
      ball(c, n * 0.006, at, 0.032, 1);
      stroke(c, n * 0.006, circle(at, 0.075, 'xz'), 0.8);
    });
  });

  // Edges down, with a pulse always running downwards.
  EDGES.forEach(([layer, from, to], e) => {
    const a = module(layer, from);
    const b = module(layer + 1, to);
    stroke(
      c,
      n * 0.018,
      segment(a, b),
      0.55,
      (u) => [Kind.pulse, (e * 0.37) % 1, u, 0.4, 0.06],
      0.003,
    );
  });

  // A thin axis through the middle, tying the stack.
  stroke(
    c,
    n * 0.01,
    segment([0, LAYERS[0]! + 0.18, 0], [0, LAYERS[3]! - 0.18, 0]),
    0.18,
  );
}
