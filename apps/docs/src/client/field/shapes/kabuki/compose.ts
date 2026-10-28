import { Kind, ball, box, line, revealed } from '../pen/index.ts';
import type { Cloud, Label, Motion, V3 } from '../pen/index.ts';

/*
 * compose: Actors made of Actors. App holds Session, Cart and Search; Cart
 * holds two Items for as long as it lives. Search holds Results only while
 * it is Searching: drawn in, held, then dissolved, over and over, a dashed
 * outline marking its place while it is gone.
 */

const W = 0.34;
const H = 0.16;
const ROWS = [0.62, 0.04, -0.54];

const APP: V3 = [0, ROWS[0]!, 0];
const SESSION: V3 = [-0.66, ROWS[1]!, 0];
const CART: V3 = [0, ROWS[1]!, 0];
const SEARCH: V3 = [0.66, ROWS[1]!, 0];
const ITEM_A: V3 = [-0.22, ROWS[2]!, 0];
const ITEM_B: V3 = [0.22, ROWS[2]!, 0];
const RESULTS: V3 = [0.66, ROWS[2]!, 0];

/** When the Results branch is drawn in, on the story clock. */
const EDGE = { start: 0.12, length: 0.12 } as const;
const NODE = { start: 0.26, length: 0.08 } as const;

/** An Actor: a rounded box with a dot at its left. */
function node(
  c: Cloud,
  at: V3,
  motion?: (u: number) => Motion,
  bright = 0.9,
): void {
  box(c, at, W, H, 0.04, bright, motion);
  ball(
    c,
    c.n * 0.0025,
    [at[0] - W / 2 + 0.05, at[1], 0],
    0.012,
    1.4,
    motion?.(0.5),
  );
}

/** Down, across, down, from the bottom of `a` to the top of `b`. */
function elbow(c: Cloud, a: V3, b: V3, motion?: (u: number) => Motion): void {
  const top: V3 = [a[0], a[1] - H / 2, 0];
  const bottom: V3 = [b[0], b[1] + H / 2, 0];
  const mid = (top[1] + bottom[1]) / 2;
  const legs: Array<[V3, V3]> = [
    [top, [top[0], mid, 0]],
    [
      [top[0], mid, 0],
      [bottom[0], mid, 0],
    ],
    [[bottom[0], mid, 0], bottom],
  ];
  const lengths = legs.map(
    ([p, q]) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]),
  );
  const total = lengths.reduce((s, l) => s + l, 0);
  let done = 0;
  legs.forEach(([p, q], k) => {
    if (lengths[k]! < 1e-6) return;
    const from = done / total;
    const span = lengths[k]! / total;
    line(c, p, q, 0.5, motion && ((u) => motion(from + u * span)));
    done += lengths[k]!;
  });
}

/** A dashed rounded box: where Results sits while it does not exist. */
function dashed(c: Cloud, at: V3): void {
  const x0 = at[0] - W / 2;
  const x1 = at[0] + W / 2;
  const y0 = at[1] - H / 2;
  const y1 = at[1] + H / 2;
  const dash = 0.03;
  for (let x = x0; x < x1 - 0.01; x += dash * 2) {
    for (const y of [y0, y1])
      line(c, [x, y, 0], [Math.min(x + dash, x1), y, 0], 0.3);
  }
  for (let y = y0; y < y1 - 0.01; y += dash * 2) {
    for (const x of [x0, x1])
      line(c, [x, y, 0], [x, Math.min(y + dash, y1), 0], 0.3);
  }
}

export function compose(c: Cloud): void {
  for (const at of [APP, SESSION, CART, SEARCH, ITEM_A, ITEM_B]) node(c, at);
  for (const kid of [SESSION, CART, SEARCH]) elbow(c, APP, kid);
  for (const item of [ITEM_A, ITEM_B]) elbow(c, CART, item);

  // Results: in, held, gone; the dashed outline stays.
  dashed(c, RESULTS);
  elbow(c, SEARCH, RESULTS, (u) => [
    Kind.reveal,
    0.08,
    u,
    EDGE.start,
    EDGE.length,
  ]);
  node(c, RESULTS, (u) => [Kind.reveal, 0, u, NODE.start, NODE.length], 1);
}

export const composeLabels: readonly Label[] = [
  { text: 'App', at: [APP[0] + 0.03, APP[1], 0] },
  { text: 'Cart', at: [CART[0] + 0.03, CART[1], 0] },
  { text: 'Search', at: [SEARCH[0] + 0.03, SEARCH[1], 0] },
  {
    text: 'Results',
    at: [RESULTS[0] + 0.03, RESULTS[1], 0],
    show: (clock) => revealed(clock, 0.5, NODE.start, NODE.length),
  },
  { text: 'Session', at: [SESSION[0] + 0.03, SESSION[1], 0] },
  { text: 'Item a', at: [ITEM_A[0] + 0.03, ITEM_A[1], 0] },
  { text: 'Item b', at: [ITEM_B[0] + 0.03, ITEM_B[1], 0] },
  {
    text: 'while Searching',
    kind: 'note',
    at: [RESULTS[0], RESULTS[1] - H / 2 - 0.08, 0],
  },
];
