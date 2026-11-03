import { Kind, box, line, message, node } from '../pen/index.ts';
import type { Cloud, Label, V3 } from '../pen/index.ts';

/*
 * adapters: one table, any database. The table sits on top; under it, a
 * row of four databases, each joined to it by a hairline. The same row of
 * work goes down to each in turn, and each pops as it lands: the program
 * never changed, only where it ran.
 */

const TABLE: V3 = [0, 0.42, 0];
const Y = -0.4;
const DATABASES: readonly V3[] = [-0.84, -0.28, 0.28, 0.84].map((x): V3 => [
  x,
  Y,
  0,
]);
const NAMES = ['Memory', 'IndexedDB', 'SQLite', 'DynamoDB'] as const;
const FLIGHT = 0.7;

export function adapters(c: Cloud): void {
  box(c, TABLE, 0.56, 0.3, 0.05, 1.1);
  node(c, TABLE, 1.1);
  DATABASES.forEach((at, k) => {
    box(c, at, 0.36, 0.22, 0.04, 0.75);
    const from: V3 = [TABLE[0], TABLE[1] - 0.16, 0];
    const to: V3 = [at[0], at[1] + 0.12, 0];
    line(c, from, to, 0.28);
    const leaves = 0.4 + k * 2;
    message(
      c,
      from,
      [to[0] - from[0], to[1] - from[1]],
      leaves,
      FLIGHT,
      Kind.glide,
    );
    node(c, at, 0.7, { at: leaves + 0.12 + FLIGHT });
  });
}

export const adaptersLabels: readonly Label[] = [
  { text: 'StdTable', at: [TABLE[0], TABLE[1] + 0.24, 0] },
  ...DATABASES.map((at, k): Label => ({
    text: NAMES[k]!,
    at: [at[0], at[1] - 0.2, 0],
  })),
];
