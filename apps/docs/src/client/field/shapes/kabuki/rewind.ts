import {
  Kind,
  STORY,
  arrow,
  ball,
  bend,
  line,
  loopOf,
  revealed,
  ring,
  segment,
  slid,
  stroke,
  windowOf,
} from '../pen/index.ts';
import type { Clock, Cloud, Label, Motion, V3 } from '../pen/index.ts';

/*
 * rewind: every Message is kept, like a commit. Five commits along a line,
 * the playhead at the newest. It steps back to `Added eggs`; the later
 * commits dim, as if not yet happened; then a branch grows from there with
 * a new commit, `Added coffee`. Then it all settles back, and goes again.
 */

const Y = 0.12;
const COMMITS = [-0.8, -0.4, 0, 0.4, 0.8];
const MESSAGES = [
  'Added milk',
  'Added eggs',
  'Added bread',
  'Checked milk',
  'Added tea',
];
const BACK_TO = 1;
const LOW = -0.36;
const COFFEE: V3 = [0.4, LOW, 0];

/** When the playhead steps back, and when the branch grows, on the story clock. */
const STEP = { start: 0.14, length: 0.16 } as const;
const BRANCH = { start: 0.36, length: 0.3 } as const;
/** While the later commits are dimmed. */
const LATER = { start: 0.3, length: 0.58 } as const;

/** How far back the playhead has gone, 0..1. */
const back = (clock: Clock) => slid(clock, STEP.start, STEP.length);
/** How dimmed the later commits are, 0..1. */
const dimmed = (clock: Clock) =>
  windowOf(loopOf(clock), LATER.start, LATER.length, 0.05);

export function rewind(c: Cloud): void {
  const { n } = c;
  const later: Motion = [Kind.cycle, 0.9, LATER.start, LATER.length, STORY];
  const fork = COMMITS[BACK_TO]!;
  const last = COMMITS[COMMITS.length - 1]!;

  line(c, [COMMITS[0]!, Y, 0], [fork, Y, 0], 0.6);
  line(c, [fork, Y, 0], [last, Y, 0], 0.6, () => later);
  COMMITS.forEach((x, k) => {
    const motion = k > BACK_TO ? () => later : undefined;
    ring(c, [x, Y, 0], 0.04, 1, motion);
    ball(c, n * 0.002, [x, Y, 0], 0.012, 1.4, motion?.());
  });

  // The playhead: a ring round the newest commit, stepping back.
  const step: Motion = [Kind.slide, 0, fork - last, STEP.start, STEP.length];
  ring(c, [last, Y, 0], 0.085, 1.2, () => step);

  // The branch, grown from the commit stepped back to.
  const grow =
    (from: number, to: number) =>
    (u: number): Motion => [
      Kind.reveal,
      0,
      from + (to - from) * u,
      BRANCH.start,
      BRANCH.length,
    ];
  const turn: V3 = [fork + 0.2, LOW, 0];
  const curve = bend([fork, Y - 0.05, 0], [fork, LOW, 0], turn);
  const curveLen = 0.5;
  const straightLen = COFFEE[0] - 0.06 - turn[0];
  const total = curveLen + straightLen;
  stroke(
    c,
    n * 0.024 * curveLen,
    curve,
    0.75,
    grow(0, curveLen / total),
    0.0015,
  );
  arrow(
    c,
    segment(turn, [COFFEE[0] - 0.06, LOW, 0]),
    straightLen,
    0.75,
    grow(curveLen / total, 1),
  );
  const coffee: Motion = [Kind.reveal, 0, 1, BRANCH.start, BRANCH.length];
  ring(c, COFFEE, 0.04, 1.1, () => coffee);
  ball(c, n * 0.002, COFFEE, 0.012, 1.4, coffee);
}

export const rewindLabels: readonly Label[] = [
  {
    text: 'you are here',
    kind: 'message',
    at: (clock) => {
      const last = COMMITS[COMMITS.length - 1]!;
      const x = last + (COMMITS[BACK_TO]! - last) * back(clock);
      return [x, Y + 0.48, 0];
    },
  },
  {
    text: 'Added coffee',
    at: [COFFEE[0], LOW - 0.12, 0],
    show: (clock) => revealed(clock, 1, BRANCH.start, BRANCH.length),
  },
  // The commit stepped back to first: where there is no room for all,
  // the ones that tell the story win.
  ...[BACK_TO, 4, 0, 2, 3].map((k): Label => ({
    text: MESSAGES[k]!,
    at: [COMMITS[k]!, Y + (k % 2 === 0 ? 0.16 : 0.3), 0],
    lit: k > BACK_TO ? (clock) => dimmed(clock) < 0.5 : () => true,
  })),
];
