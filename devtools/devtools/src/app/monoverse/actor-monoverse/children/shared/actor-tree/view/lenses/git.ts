import { useMemo } from 'react';

import {
  changeTallies,
  statusOf,
  type Change,
  type ChangeStatus,
} from '../../../../../logic/shared/index.js';

/*
 * The Git lens: each node coloured by what changed in it since the Base
 * ref, a folder or a Package by everything inside it.
 */

export interface NodeChange {
  readonly status: ChangeStatus;
  readonly count: number;
}

/** What changed in each node; empty with Git mode off. */
export function useChanges(
  changes: ReadonlyArray<Change> | null,
): ReadonlyMap<string, NodeChange> {
  return useMemo(() => {
    if (changes === null) return new Map();
    return new Map(
      [...changeTallies(changes)].map(([path, tally]) => [
        path,
        {
          status: statusOf(tally),
          count: tally.added + tally.modified + tally.deleted,
        },
      ]),
    );
  }, [changes]);
}
