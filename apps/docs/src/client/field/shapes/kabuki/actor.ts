import {
  Kind,
  ball,
  bend,
  box,
  popping,
  stroke,
  travelled,
} from '../pen/index.ts';
import type { Clock, Cloud, Label, Motion, V3 } from '../pen/index.ts';
import { WAIT, message, node, sec } from './beats.ts';

/*
 * actor: the building block. On the left a View, a card showing a count as
 * a row of dots; on the right the Actor, one bright dot, its Model a row of
 * dots under it. Every three seconds, one chain: Increment flies over from
 * the View, the Actor pops as it lands and its Model gains a dot; the
 * update flies back underneath, the View pops as it lands and shows the
 * same dot. Three times, counting to four; then both rows fall back to
 * one, and the loop closes where it began.
 */

const VIEW: V3 = [-0.58, 0, 0];
const ACTOR: V3 = [0.58, 0.04, 0];
const CARD = { w: 0.5, h: 0.38 } as const;
const MODEL = (k: number): V3 => [ACTOR[0] + (k - 1.5) * 0.07, -0.13, 0];
const SHOWN = (k: number): V3 => [VIEW[0] + (k - 1.5) * 0.09, 0, 0];

/** When each chain starts, in seconds. */
const CHAINS = [0, 3, 6];
const FLIGHT = 0.75;
/** When the Message lands, and the update after it, from a chain's start. */
const LANDS = WAIT + FLIGHT;
const BACK = LANDS + 0.15;
const SHOWS = BACK + WAIT + FLIGHT;
/** When the rows fall back to one. */
const RESET = 8.5;

const out: V3 = [VIEW[0] + CARD.w / 2 + 0.04, ACTOR[1], 0];
const outBy = [ACTOR[0] - out[0], 0] as const;
const home: V3 = [VIEW[0] + CARD.w / 2 + 0.02, -0.06, 0];
const backBy = [home[0] - ACTOR[0], home[1] - ACTOR[1]] as const;

/** A faint arc, the way a Message flies. */
function route(c: Cloud, from: V3, by: readonly [number, number]): void {
  const to: V3 = [from[0] + by[0], from[1] + by[1], 0];
  // A curve's middle is half way to its pull: pull twice the arc's height.
  const via: V3 = [from[0] + by[0] / 2, from[1] + by[1] / 2 + by[0] * 0.6, 0];
  stroke(c, c.n * 0.024 * Math.abs(by[0]) * 1.1, bend(from, via, to), 0.12);
}

/** A dot that joins a row once a Message has landed, until the reset. */
const joins = (at: number): Motion => [
  Kind.gather,
  sec(at),
  sec(RESET - at),
  0.12,
  0,
];

export function actor(c: Cloud): void {
  const { n } = c;

  // The View, popping each time an update lands, and the count it shows.
  const viewPops = popping(sec(SHOWS), VIEW, CHAINS.length, 0.06);
  box(c, VIEW, CARD.w, CARD.h, 0.05, 0.55, () => viewPops);
  ball(c, n * 0.0025, SHOWN(0), 0.013, 1.3);
  CHAINS.forEach((at, k) =>
    ball(c, n * 0.0025, SHOWN(k + 1), 0.013, 1.3, joins(at + SHOWS)),
  );

  // The Actor, popping as each Message lands, and its Model.
  node(c, ACTOR, 1.6, { at: LANDS, repeats: CHAINS.length });
  ball(c, n * 0.0025, MODEL(0), 0.011, 1.1);
  CHAINS.forEach((at, k) =>
    ball(c, n * 0.0025, MODEL(k + 1), 0.011, 1.1, joins(at + LANDS + 0.05)),
  );

  route(c, out, outBy);
  route(c, [ACTOR[0], ACTOR[1] - 0.04, 0], backBy);
  for (const at of CHAINS) {
    message(c, out, outBy, at, FLIGHT);
    message(c, ACTOR, backBy, at + BACK, FLIGHT);
  }
}

/** Where Increment is now, riding over its Message, and how shown. */
const increment = (clock: Clock): { at: V3; on: number } => {
  for (const at of CHAINS) {
    const { on, s } = travelled(
      clock,
      sec(at),
      sec(WAIT + FLIGHT),
      sec(FLIGHT),
      Kind.travel,
    );
    if (on > 0.01)
      return {
        on,
        at: [
          out[0] + outBy[0] * s,
          out[1] + outBy[0] * 0.3 * Math.sin(Math.PI * s) + 0.1,
          0,
        ],
      };
  }
  return { on: 0, at: out };
};

export const actorLabels: readonly Label[] = [
  { text: 'View', at: [VIEW[0], CARD.h / 2 + 0.09, 0] },
  { text: 'Actor', at: [ACTOR[0], ACTOR[1] + 0.14, 0] },
  {
    text: 'Increment',
    kind: 'message',
    at: (clock) => increment(clock).at,
    show: (clock) => increment(clock).on,
  },
  { text: 'Model', kind: 'note', at: [ACTOR[0], -0.25, 0] },
];
