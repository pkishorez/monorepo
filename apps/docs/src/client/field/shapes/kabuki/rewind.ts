import {
  Kind,
  STORY,
  ball,
  bend,
  gathered,
  line,
  segment,
  stroke,
} from '../pen/index.ts';
import type { Cloud, Label, Motion, Path, V3 } from '../pen/index.ts';
import { node, ring, sec } from './beats.ts';
import { marker, markerAt } from './marker.ts';
import type { Place } from './marker.ts';

/*
 * rewind: every Message is kept, like a commit. Five commits on a line,
 * and the playhead, a short bright bar, at the newest. It slides back to
 * `Added eggs`, easing out and braking in, and that commit pops as it
 * arrives while the ones after it fade, kept but not yet happened. A
 * branch draws itself up from there; a commit pops onto it and the
 * playhead follows, then another. Then the branch scatters, the playhead
 * slides home to the newest, and the loop closes where it began.
 */

const Y = -0.12;
const UP = 0.3;
const COMMITS = [-0.8, -0.4, 0, 0.4, 0.8];
const BACK_TO = 1;
const FORK = COMMITS[BACK_TO]!;
const NEWEST: V3 = [COMMITS[4]!, Y, 0];
const BRANCH: V3[] = [
  [0, UP, 0],
  [0.4, UP, 0],
];

/** When the playhead lands at each place, and how long its slide, in seconds. */
const ROUND: readonly Place[] = [
  { at: NEWEST, arrive: sec(8.3), move: sec(1) },
  { at: [FORK, Y, 0], arrive: sec(1.5), move: sec(1.1) },
  { at: BRANCH[0]!, arrive: sec(3), move: sec(0.6) },
  { at: BRANCH[1]!, arrive: sec(4.3), move: sec(0.6) },
];
/** When each part of the branch draws, and each of its commits pops on. */
const DRAWS = [
  { from: 1.75, to: 2.3 },
  { from: 3.15, to: 3.5 },
];
/** When the branch scatters, in seconds. */
const GONE = 7.3;

/** The commits after the one stepped back to fade while the branch is out. */
const LATER: Motion = [Kind.cycle, 0.9, sec(0.5), sec(7.2), STORY];

/** A line that draws itself along its length from `from` to `to` seconds. */
function draws(
  c: Cloud,
  path: Path,
  length: number,
  from: number,
  to: number,
): void {
  stroke(
    c,
    c.n * 0.024 * length,
    path,
    0.32,
    (u): Motion => {
      const at = from + (to - from) * u;
      return [Kind.gather, sec(at), sec(GONE - at), 0.04, 0];
    },
    0.0015,
  );
}

export function rewind(c: Cloud): void {
  line(c, [COMMITS[0]!, Y, 0], [FORK, Y, 0], 0.3);
  line(c, [FORK, Y, 0], NEWEST, 0.3, () => LATER);
  COMMITS.forEach((x, k) => {
    if (k === BACK_TO) node(c, [x, Y, 0], 0.7, { at: 1.5 });
    else
      ball(
        c,
        c.n * 0.003,
        [x, Y, 0],
        0.015,
        1.1,
        k > BACK_TO ? LATER : undefined,
      );
  });
  ring(c, NEWEST, 0.02, { at: 8.3 });

  // The branch, from the commit stepped back to: up the curve, then
  // along to the first new commit, drawn at one speed.
  const turn: V3 = [FORK + 0.2, UP, 0];
  const curve = 0.4;
  const along = BRANCH[0]![0] - turn[0];
  const { from, to } = DRAWS[0]!;
  const mid = from + ((to - from) * curve) / (curve + along);
  draws(c, bend([FORK, Y + 0.03, 0], [FORK, UP, 0], turn), curve, from, mid);
  draws(c, segment(turn, BRANCH[0]!), along, mid, to);
  draws(c, segment(BRANCH[0]!, BRANCH[1]!), 0.4, DRAWS[1]!.from, DRAWS[1]!.to);
  BRANCH.forEach((at, k) => {
    const pops = DRAWS[k]!.to;
    ball(c, c.n * 0.003, at, 0.015, 1.2, [
      Kind.gather,
      sec(pops),
      sec(GONE - pops),
      0.12,
      0,
    ]);
    ring(c, at, 0.02, { at: k === 0 ? 3 : 4.3 });
  });

  // The playhead.
  marker(c, ROUND, (c, at, motion) =>
    line(
      c,
      [at[0], at[1] - 0.075, 0],
      [at[0], at[1] + 0.075, 0],
      1.5,
      () => motion,
    ),
  );
}

export const rewindLabels: readonly Label[] = [
  {
    text: 'now',
    kind: 'message',
    at: (clock) => {
      const [x, y, z] = markerAt(clock, ROUND);
      return [x, y + 0.17, z];
    },
  },
  { text: 'Added eggs', at: [FORK, Y - 0.13, 0] },
  {
    text: 'Added coffee',
    at: [BRANCH[1]![0], UP - 0.12, 0],
    show: (clock) =>
      gathered(clock, sec(DRAWS[1]!.to), sec(GONE - DRAWS[1]!.to)),
  },
];
