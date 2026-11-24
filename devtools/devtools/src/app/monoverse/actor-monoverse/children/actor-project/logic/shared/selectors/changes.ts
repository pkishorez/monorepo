import { ancestorsOf } from './paths.js';

/*
 * Git mode's roll-up: a changed file is added, modified or deleted, and a
 * folder (or a Package) takes the colour of what changed inside it: added
 * when everything in it that changed was added, deleted when all of it was
 * deleted, and modified for anything else.
 */

export type ChangeStatus = 'added' | 'modified' | 'deleted';

export interface Change {
  readonly path: string;
  readonly status: ChangeStatus;
}

export interface Tally {
  readonly added: number;
  readonly modified: number;
  readonly deleted: number;
}

/** What changed in each path: the file itself, and every folder above it. */
export function changeTallies(
  changes: ReadonlyArray<Change>,
): ReadonlyMap<string, Tally> {
  const tallies = new Map<string, Tally>();
  for (const { path, status } of changes) {
    for (const at of [path, ...ancestorsOf(path)]) {
      const tally = tallies.get(at) ?? { added: 0, modified: 0, deleted: 0 };
      tallies.set(at, { ...tally, [status]: tally[status] + 1 });
    }
  }
  return tallies;
}

/** The one colour a tally rolls up to. */
export function statusOf(tally: Tally): ChangeStatus {
  const total = tally.added + tally.modified + tally.deleted;
  if (tally.added === total) return 'added';
  if (tally.deleted === total) return 'deleted';
  return 'modified';
}
