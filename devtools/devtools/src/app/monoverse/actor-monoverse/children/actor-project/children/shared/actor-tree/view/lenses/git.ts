import { useMemo } from 'react';

import {
  changeTallies,
  statusOf,
  type Change,
  type ChangeStatus,
} from '../../../../../logic/shared/index.js';

export interface NodeChange {
  readonly status: ChangeStatus;
  readonly count: number;
}

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
