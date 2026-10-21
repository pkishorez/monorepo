import { Kind, ball, box, line, loopOf } from '../pen/index.ts';
import type { Clock, Cloud, Label, Motion, V3 } from '../pen/index.ts';

/*
 * renders: only what changed draws again. A small app: a header, a
 * sidebar, four cards. About every second a Message lands on one card,
 * that card alone re-renders, a flash that fades, and the next lands on
 * another; nothing else ever moves.
 */

const FRAME = { w: 1.72, h: 1.2 } as const;
const TOP = FRAME.h / 2;
const LEFT = -FRAME.w / 2;
const HEADER = TOP - 0.16;
const SIDEBAR = LEFT + 0.42;
/** The cards, two by two in the main area. */
const CARDS: V3[] = [
  [0.0, 0.17, 0],
  [0.55, 0.17, 0],
  [0.0, -0.3, 0],
  [0.55, -0.3, 0],
];
const CARD = { w: 0.47, h: 0.36 } as const;
/** The order Messages land in, one per beat. */
const ORDER = [0, 3, 1, 2];
const BEAT = 1.2;
const PERIOD = ORDER.length * BEAT;

/** Which card re-renders now, and how many seconds since. */
export function rendering(clock: Clock): { card: number; since: number } {
  const beats = loopOf(clock, PERIOD) * ORDER.length;
  const beat = Math.min(Math.floor(beats), ORDER.length - 1);
  return { card: ORDER[beat]!, since: (beats - beat) * BEAT };
}

export function renders(c: Cloud): void {
  const { n } = c;
  box(c, [0, 0, 0], FRAME.w, FRAME.h, 0.05, 0.75);
  line(c, [LEFT, HEADER, 0], [-LEFT, HEADER, 0], 0.45);
  ball(c, n * 0.003, [LEFT + 0.09, TOP - 0.08, 0], 0.016, 1.2);
  for (const x of [0.38, 0.56, 0.74])
    line(c, [x - 0.06, TOP - 0.08, 0], [x + 0.06, TOP - 0.08, 0], 0.4);
  line(c, [SIDEBAR, HEADER, 0], [SIDEBAR, -TOP, 0], 0.45);
  for (let k = 0; k < 4; k++) {
    const y = HEADER - 0.12 - k * 0.1;
    line(c, [LEFT + 0.08, y, 0], [SIDEBAR - 0.1 + (k % 2) * 0.04, y, 0], 0.35);
  }

  CARDS.forEach((at, card) => {
    const turn = ORDER.indexOf(card) / ORDER.length;
    const flash = (): Motion => [
      Kind.cycle,
      0.5,
      turn,
      1 / ORDER.length,
      PERIOD,
    ];
    box(c, at, CARD.w, CARD.h, 0.035, 0.7, flash);
    const x = at[0] - CARD.w / 2 + 0.06;
    line(c, [x, at[1] + 0.09, 0], [x + 0.16, at[1] + 0.09, 0], 0.9, flash);
    line(c, [x, at[1] + 0.01, 0], [x + 0.3, at[1] + 0.01, 0], 0.45, flash);
    line(c, [x, at[1] - 0.06, 0], [x + 0.22, at[1] - 0.06, 0], 0.45, flash);
  });
}

/** Shown while a beat is young: in quick, out over the beat. */
const fresh = (since: number) =>
  Math.min(since / 0.12, 1) * Math.max(0, 1 - since / BEAT) ** 0.6;

export const rendersLabels: readonly Label[] = [
  {
    text: '+1',
    kind: 'message',
    // The Message flies in from above and lands on the card.
    at: (clock) => {
      const { card, since } = rendering(clock);
      const at = CARDS[card]!;
      const land = Math.min(since / 0.35, 1);
      const k = 1 - (1 - land) ** 3;
      return [at[0] + 0.12, at[1] + CARD.h / 2 + 0.11 + (1 - k) * 0.35, 0];
    },
    show: (clock) => fresh(rendering(clock).since),
  },
  {
    text: 're-rendered',
    at: (clock) => {
      const at = CARDS[rendering(clock).card]!;
      return [at[0], at[1] - CARD.h / 2 - 0.06, 0];
    },
    show: (clock) => fresh(rendering(clock).since - 0.15),
  },
  {
    text: 'everything else: untouched',
    kind: 'note',
    at: [LEFT + 0.42, -TOP - 0.1, 0],
  },
];
