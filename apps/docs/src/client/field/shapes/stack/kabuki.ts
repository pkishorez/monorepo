import { Kind } from '../pen/index.ts';
import type { Clock, Cloud, Label, Motion, V3 } from '../pen/index.ts';
import {
  TAU,
  ball,
  bend,
  circle,
  lerp3,
  length3,
  stroke,
  sub3,
} from '../pen/index.ts';

/*
 * kabuki: an app as one tree of Actors. A root, three children, a few
 * grandchildren: each Actor a dense ball ringed by its states, each edge a
 * thin line. Down each branch in turn a Message runs from the root, a
 * bright head with a fading tail: the root flares as it sends it, and each
 * Actor below flares as it lands, its name lit with it.
 */

/** Laps per second of one branch's Message, root to grandchildren and back to the top. */
const LAPS = 0.24;
/** The edges' whole length, root to grandchild, in laps. */
const DEPTH = 2.6;
/** How long an Actor glows once a Message lands, in laps. */
const GLOW = 0.08;

/** Where in its lap a branch's Message is, 0..1. (shader: `Kind.message`) */
const lapOf = (clock: Clock, branch: number) => clock.time * LAPS + branch / 3;
/** The lit Actor's level: 0 the root, 1 a child, 2 a grandchild. */
const landed = (clock: Clock, branch: number, level: number) => {
  const since = lapOf(clock, branch) - level / DEPTH;
  return since - Math.floor(since) < GLOW * 2;
};

/** How an Actor's points flare when a Message reaches it. */
const arrival = (actor: Actor, level: number): Motion =>
  level === 0
    ? // The root sends to each branch in turn: three times a lap.
      [Kind.arrive, 0, 0, LAPS * 3, GLOW * 3]
    : [Kind.arrive, actor.branch / 3, level / DEPTH, LAPS, GLOW];

type Actor = {
  readonly at: V3;
  readonly parent?: number;
  readonly branch: number;
};

function tree(): Actor[] {
  const actors: Actor[] = [{ at: [0, 0.78, 0], branch: 0 }];
  const grandchildren = [2, 1, 2];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.4;
    const child = actors.length;
    actors.push({
      at: [Math.cos(a) * 0.58, 0.06, Math.sin(a) * 0.58],
      parent: 0,
      branch: k,
    });
    const count = grandchildren[k] ?? 0;
    for (let g = 0; g < count; g++) {
      const ga = a + (count === 1 ? 0 : (g - (count - 1) / 2) * 0.62);
      actors.push({
        at: [Math.cos(ga) * 0.84, -0.66, Math.sin(ga) * 0.84],
        parent: child,
        branch: k,
      });
    }
  }
  return actors;
}

export function kabuki(c: Cloud): void {
  const { n } = c;
  const actors = tree();

  // Each Actor: a dense heart, a ring of its states, three of them lit.
  for (const actor of actors) {
    const big = actor.parent === undefined ? 1.3 : 1;
    const level = levelOf(actors, actor);
    const flare = arrival(actor, level);
    ball(c, n * 0.01 * big, actor.at, 0.045 * big, 0.9, flare);
    stroke(
      c,
      n * 0.012 * big,
      circle(actor.at, 0.11 * big, 'xz'),
      0.75,
      () => flare,
    );
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * TAU + actor.branch;
      const r = 0.11 * big;
      const [x, y, z] = actor.at;
      ball(
        c,
        n * 0.0012,
        [x + Math.cos(a) * r, y, z + Math.sin(a) * r],
        0.012,
        2,
      );
    }
  }

  // Edges, sagging a little, with Messages running down them: a pulse
  // leaves the root and carries on into the branch below.
  const edges = actors.filter((a) => a.parent !== undefined);
  const total = edges.reduce(
    (sum, a) => sum + length3(sub3(a.at, actors[a.parent ?? 0]!.at)),
    0,
  );
  for (const actor of edges) {
    const from = actors[actor.parent ?? 0]!.at;
    const to = actor.at;
    const depth = actor.parent === 0 ? 0 : 1;
    const via = lerp3(from, to, 0.5);
    via[1] -= 0.08;
    const share = length3(sub3(to, from)) / total;
    stroke(
      c,
      n * 0.36 * share,
      bend(from, via, to),
      0.55,
      (u) => [Kind.message, actor.branch / 3, (depth + u) / DEPTH, LAPS, 0.03],
      0.004,
    );
  }
}

function levelOf(actors: readonly Actor[], actor: Actor): number {
  return actor.parent === undefined
    ? 0
    : 1 + levelOf(actors, actors[actor.parent]!);
}

/**
 * The root and its children named, over their places in the tree, each
 * lit while a Message lands on it.
 */
export const kabukiLabels: readonly Label[] = (() => {
  const actors = tree();
  const root = actors[0]!;
  const kids = actors.filter((a) => a.parent === 0);
  const names = ['Session', 'Sync', 'Files'];
  return [
    {
      text: 'App',
      at: [root.at[0], root.at[1] + 0.17, root.at[2]],
      lit: (clock) => [0, 1, 2].some((b) => landed(clock, b, 0)),
    },
    ...kids.map((kid, k): Label => ({
      text: names[k]!,
      at: [kid.at[0], kid.at[1] + 0.17, kid.at[2]],
      lit: (clock) => landed(clock, kid.branch, 1),
    })),
  ];
})();
