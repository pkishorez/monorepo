import { Kind, ball, gathered, line, node, sec } from '../pen/index.ts';
import type { Clock, Cloud, Label, Motion, V3 } from '../pen/index.ts';
import { marker, markerAt } from './marker.ts';
import type { Place } from './marker.ts';

/*
 * states: what runs is decided by the state. Idle, Loading and Ready are
 * three quiet points on a line; the current state is one bright point that
 * hops from each to the next, and at the end back round underneath to
 * Idle. Each state pops as it lands, and what it runs pops into being
 * right after, one by one: Loading's three Workers, Ready's Profile. Just
 * before it leaves, they scatter, nothing left behind.
 */

const X = [-0.64, 0, 0.64];
const NAMES = ['Idle', 'Loading', 'Ready'];

/** The current state's round, in seconds: when it lands at each, and how long the hop. */
const LANDS = [8, 1.3, 4.4];
const HOPS = [1, 0.8, 0.8];
const ROUND: readonly Place[] = X.map((x, k) => ({
  at: [x, 0, 0],
  arrive: sec(LANDS[k]!),
  move: sec(HOPS[k]!),
}));

/** What each state runs: where, from when, until when, in seconds. */
const WORKERS = { from: LANDS[1]! + 0.1, until: 3.4 } as const;
const PROFILE = { from: LANDS[2]! + 0.1, until: 6.9 } as const;
const WORKER_AT = [-0.12, 0, 0.12].map((dx): V3 => [X[1]! + dx, 0.26, 0]);
const PROFILE_AT: V3 = [X[2]!, 0.28, 0];
/** One after the other, this far apart, in seconds. */
const STAGGER = 0.08;

/** Whether state `k` is the current one now. */
const isCurrent = (clock: Clock, k: number): boolean =>
  Math.abs(markerAt(clock, ROUND, Kind.travel)[0] - X[k]!) < 0.04;

function runs(
  c: Cloud,
  from: V3,
  to: V3,
  size: number,
  start: number,
  until: number,
): void {
  const formed: Motion = [Kind.gather, sec(start), sec(until - start), 0.18, 0];
  line(
    c,
    [from[0], from[1] + 0.05, 0],
    [to[0], to[1] - 0.04, 0],
    0.3,
    () => formed,
  );
  ball(c, c.n * 0.003 * size, to, 0.014 * size, 1.3, formed);
}

export function states(c: Cloud): void {
  line(c, [X[0]!, 0, 0], [X[2]!, 0, 0], 0.2);
  X.forEach((x, k) =>
    node(c, [x, 0, 0], 0.7, { at: LANDS[k]! }, undefined, 0.75),
  );

  marker(
    c,
    ROUND,
    (c, at, motion) => ball(c, c.n * 0.008, at, 0.03, 1.8, motion),
    Kind.travel,
  );

  WORKER_AT.forEach((at, k) =>
    runs(
      c,
      [X[1]!, 0, 0],
      at,
      1,
      WORKERS.from + k * STAGGER,
      WORKERS.until + k * STAGGER * 0.5,
    ),
  );
  runs(c, [X[2]!, 0, 0], PROFILE_AT, 1.6, PROFILE.from, PROFILE.until);
}

export const statesLabels: readonly Label[] = [
  ...NAMES.map((text, k): Label => ({
    text,
    at: [X[k]!, -0.13, 0],
    lit: (clock) => isCurrent(clock, k),
  })),
  {
    text: 'Workers',
    at: [X[1]!, 0.4, 0],
    show: (clock) =>
      gathered(clock, sec(WORKERS.from), sec(WORKERS.until - WORKERS.from)),
  },
  {
    text: 'Profile',
    at: [X[2]!, 0.42, 0],
    show: (clock) =>
      gathered(clock, sec(PROFILE.from), sec(PROFILE.until - PROFILE.from)),
  },
];
