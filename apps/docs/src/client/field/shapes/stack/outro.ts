import {
  Kind,
  WAIT,
  ball,
  box,
  message,
  popping,
  rippling,
  roundRect,
  sec,
  stroke,
} from '../pen/index.ts';
import type { Cloud, Label, Motion, V3 } from '../pen/index.ts';

/*
 * The end: more is coming. Three packages in a row, each a rounded box
 * with a small grid of dots inside. The first is built: kabuki. The other
 * two are faint sketches, waiting. Then one chain: kabuki pops and sends a
 * Message to the next; it lands, that box draws its outline, its dots pop
 * in one after the other, and a ring runs out from it. Then it sends one
 * on to the last, which builds the same way. A while later both fall back
 * to sketches, the last first, and the loop closes where it began.
 */

const SIZE = 0.44;
const GAP = 0.62;
const AT: readonly V3[] = [
  [-GAP, 0, 0],
  [0, 0, 0],
  [GAP, 0, 0],
];
/** Dots across and down inside a package. */
const DOTS = 4;
const FLIGHT = 0.7;

/** When each package being built is sent its Message, and when it falls back, in seconds. */
const BUILDS = [
  { sent: 0.3, until: 7.7 },
  { sent: 3.3, until: 7.5 },
] as const;
/** From when it is sent to, how long its outline takes, when its dots start, and when it rings. */
const DRAW = 0.5;
const FILL = 0.35;
const RING = 0.95;

const lands = (sent: number) => sent + WAIT + FLIGHT;

function dots(
  c: Cloud,
  at: V3,
  motion: (i: number, j: number) => Motion | undefined,
): void {
  const inner = SIZE * 0.5;
  for (let i = 0; i < DOTS; i++)
    for (let j = 0; j < DOTS; j++)
      ball(
        c,
        c.n * 0.0012,
        [
          at[0] + ((i + 0.5) / DOTS - 0.5) * inner,
          at[1] - ((j + 0.5) / DOTS - 0.5) * inner,
          0,
        ],
        0.006,
        0.9,
        motion(i, j),
      );
}

export function outro(c: Cloud): void {
  // Built: kabuki, popping as it sends the first Message.
  const sends = popping(sec(BUILDS[0].sent), AT[0]!, 1, 0.1);
  box(c, AT[0]!, SIZE, SIZE, 0.07, 1.1, () => sends);
  dots(c, AT[0]!, () => sends);

  BUILDS.forEach((build, k) => {
    const at = AT[k + 1]!;
    const from = AT[k]!;
    const landed = lands(build.sent);

    // The sketch it is built over, always there.
    box(c, at, SIZE, SIZE, 0.07, 0.22);

    // Its outline, drawing itself round from where the Message lands.
    box(c, at, SIZE, SIZE, 0.07, 1, (u): Motion => {
      const start = landed + DRAW * u;
      return [Kind.gather, sec(start), sec(build.until - start), 0.03, 0];
    });
    // Its dots, popping in one after the other.
    dots(c, at, (i, j): Motion => {
      const start = landed + FILL + (i + j) * 0.05;
      return [Kind.gather, sec(start), sec(build.until - start), 0.08, 0];
    });
    const ring = rippling(sec(landed + RING), at, 1, 0.05);
    stroke(
      c,
      c.n * 0.03,
      roundRect(at, SIZE + 0.04, SIZE + 0.04, 0.08),
      0.8,
      () => ring,
    );

    message(
      c,
      [from[0] + SIZE / 2 + 0.02, 0, 0],
      [at[0] - from[0] - SIZE - 0.04, 0],
      build.sent,
      FLIGHT,
    );
  });
}

export const outroLabels: readonly Label[] = [
  { text: 'kabuki', at: [AT[0]![0], SIZE / 2 + 0.1, 0] },
];
