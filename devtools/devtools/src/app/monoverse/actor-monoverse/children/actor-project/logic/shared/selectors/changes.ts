import { ancestorsOf } from './paths.js';

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

export function statusOf(tally: Tally): ChangeStatus {
  const total = tally.added + tally.modified + tally.deleted;
  if (tally.added === total) return 'added';
  if (tally.deleted === total) return 'deleted';
  return 'modified';
}
