import {
  ball,
  box,
  popping,
  rippling,
  roundRect,
  stroke,
  WAIT,
  message,
  sec,
} from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';

/*
 * renders: only what changed draws again. A small app, its parts six
 * tiles in a frame, each a quiet grid of dots. Every second and a half a
 * Message drops in from above, fast and then slowing, onto one tile; that
 * tile alone pops as it lands, its dots swelling and settling and its
 * outline running out from it, while every other tile stays perfectly
 * still. Each tile in its turn, once a loop.
 */

const FRAME = { w: 1.72, h: 1.1 } as const;
const TOP = FRAME.h / 2;
const TILE = { w: 0.46, h: 0.38 } as const;
const TILES: V3[] = [-0.54, 0, 0.54].flatMap((x) =>
  [0.22, -0.22].map((y): V3 => [x, y, 0]),
);
/** Dots across and down a tile. */
const GRID = { across: 7, down: 5 } as const;

/** Which tile each Message lands on, in turn, one every `EVERY` seconds. */
const ORDER = [3, 0, 4, 1, 5, 2];
const EVERY = 1.5;
const DROPS = ORDER.map((tile, k) => ({ tile, at: 0.2 + k * EVERY }));
const FLIGHT = 0.6;

export function renders(c: Cloud): void {
  const { n } = c;
  box(c, [0, 0, 0], FRAME.w, FRAME.h, 0.05, 0.4);

  TILES.forEach((at, tile) => {
    const drop = DROPS.find((d) => d.tile === tile);
    const lands = drop && sec(drop.at + WAIT + FLIGHT);
    const pop = lands === undefined ? undefined : popping(lands, at, 1, 0.14);
    for (let i = 0; i < GRID.across; i++)
      for (let j = 0; j < GRID.down; j++) {
        const x = at[0] + ((i + 0.5) / GRID.across - 0.5) * TILE.w;
        const y = at[1] + ((j + 0.5) / GRID.down - 0.5) * TILE.h;
        ball(c, n * 0.0007, [x, y, 0], 0.004, 0.55, pop);
      }
    if (lands !== undefined) {
      const ripple = rippling(lands, at, 1, 0.06);
      stroke(
        c,
        n * 0.03,
        roundRect(at, TILE.w + 0.04, TILE.h + 0.04, 0.03),
        0.8,
        () => ripple,
      );
    }
  });

  for (const { tile, at } of DROPS) {
    const to = TILES[tile]!;
    const from: V3 = [to[0], TOP + 0.32, 0];
    message(c, from, [0, to[1] - from[1]], at, FLIGHT);
  }
}
