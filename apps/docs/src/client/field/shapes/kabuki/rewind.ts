import { Kind, STORY } from '../pen/index.ts';
import type { Cloud, Motion } from '../pen/index.ts';
import { ball, bend, circle, segment, stroke } from '../pen/index.ts';

/*
 * rewind: any moment can be gone back to. A history, a line of commits;
 * the playhead at the newest slides back to an older one, the later
 * commits fade, and a new branch grows on from there. Then it all
 * settles back, and goes again.
 */

const Y = 0.2;
const COMMITS = [-0.8, -0.53, -0.26, 0.01, 0.28, 0.55, 0.82];
const FORK = 2;
const LOW = -0.32;

export function rewind(c: Cloud): void {
  const { n } = c;
  const fork = COMMITS[FORK]!;
  const last = COMMITS[COMMITS.length - 1]!;
  // The later history fades while the playhead is back.
  const later: Motion = [Kind.cycle, 0.9, 0.3, 0.58, STORY];

  stroke(c, n * 0.07, segment([COMMITS[0]!, Y, 0], [fork, Y, 0]), 0.55);
  stroke(c, n * 0.13, segment([fork, Y, 0], [last, Y, 0]), 0.55, () => later);
  COMMITS.forEach((x, k) => {
    const motion = k > FORK ? later : undefined;
    ball(c, n * 0.007, [x, Y, 0], 0.022, 1.4, motion);
    stroke(
      c,
      n * 0.012,
      circle([x, Y, 0], 0.045, 'xy'),
      0.7,
      motion && (() => motion),
    );
  });

  // The playhead: a ring and a marker over it, sliding back to the fork.
  const back: Motion = [Kind.slide, 0, fork - last, 0.12, 0.2];
  stroke(c, n * 0.03, circle([last, Y, 0], 0.085, 'xy'), 1.3, () => back);
  stroke(
    c,
    n * 0.008,
    segment([last - 0.035, Y + 0.17, 0], [last, Y + 0.12, 0]),
    1.4,
    () => back,
  );
  stroke(
    c,
    n * 0.008,
    segment([last + 0.035, Y + 0.17, 0], [last, Y + 0.12, 0]),
    1.4,
    () => back,
  );

  // The new branch, grown from the fork once the playhead is there.
  const grow =
    (from: number, to: number) =>
    (u: number): Motion => [Kind.reveal, 0, from + (to - from) * u, 0.36, 0.42];
  stroke(
    c,
    n * 0.025,
    bend([fork, Y - 0.05, 0], [fork + 0.02, LOW, 0], [fork + 0.3, LOW, 0]),
    0.75,
    grow(0, 0.35),
  );
  stroke(
    c,
    n * 0.055,
    segment([fork + 0.3, LOW, 0], [last, LOW, 0]),
    0.75,
    grow(0.35, 1),
  );
  const span = last - (fork + 0.3);
  for (const x of [0.2, 0.5, 0.82]) {
    const u = 0.35 + 0.65 * ((x - fork - 0.3) / span);
    const motion: Motion = [Kind.reveal, 0, u, 0.36, 0.42];
    ball(c, n * 0.007, [x, LOW, 0], 0.022, 1.5, motion);
    stroke(c, n * 0.012, circle([x, LOW, 0], 0.045, 'xy'), 0.8, () => motion);
  }
}
