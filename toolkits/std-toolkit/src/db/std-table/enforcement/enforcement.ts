import { Effect } from 'effect';
import { nextUlid } from '../../../core/index.js';
import { Snapshot, SnapshotIncompatible } from '../../../snapshot/index.js';
import type { TableSnapshot } from '../../../snapshot/index.js';
import type { StdTableContract } from '../contract/index.js';
import type { DatabaseError } from '../error/index.js';
import {
  modifyTableState,
  withBackfillNeeds,
  withEntityEpochs,
  type TableState,
} from '../state/index.js';

const REJECTED_IMPACTS = new Set(['breaking', 'unverifiable']);

const describe = (subject: {
  readonly kind: string;
  readonly name?: string | undefined;
}): string =>
  `${subject.kind}${subject.name === undefined ? '' : ` "${subject.name}"`}`;

/**
 * Diffs the table's current, code-derived snapshot against the baseline in
 * the table state record and moves the record forward when the diff is safe.
 * A `breaking` or `unverifiable` change rejects — the record is never written
 * in that case, so a live table cannot silently absorb a change it cannot
 * prove is compatible. A `requires-backfill` change is accepted, warned
 * about, and recorded as a backfill need until something settles it. Every
 * registered entity gets an epoch the first time enforcement sees it. This is
 * independent of the file-based CLI lint: it needs nothing outside the table
 * itself to protect a deployed table.
 */
export function verifyTableSnapshot(
  contract: StdTableContract,
  current: TableSnapshot,
): Effect.Effect<void, DatabaseError | SnapshotIncompatible> {
  const registered = current.entities.map((entity) => entity.name);
  const accept = (state: TableState) =>
    Effect.gen(function* () {
      if (state.snapshot === null) {
        yield* Effect.logInfo(
          `std-toolkit: captured the enforcement baseline for table "${current.logicalName}" for the first time`,
        );
        return yield* withEntityEpochs(
          { ...state, snapshot: current },
          registered,
        );
      }
      const changes = Snapshot.diff(state.snapshot, current);
      const rejected = changes.filter((change) =>
        REJECTED_IMPACTS.has(change.impact),
      );
      if (rejected.length > 0)
        return yield* Effect.fail(new SnapshotIncompatible(rejected));
      const owed = changes.filter(
        (change) => change.impact === 'requires-backfill',
      );
      for (const change of owed) {
        yield* Effect.logWarning(
          `std-toolkit: snapshot change requires a backfill (${describe(change.subject)})`,
        );
      }
      const since = yield* nextUlid;
      return yield* withEntityEpochs(
        withBackfillNeeds(
          { ...state, snapshot: current },
          owed.map((change) => change.subject),
          since,
        ),
        registered,
      );
    });
  return Effect.asVoid(modifyTableState(contract, 'verifySnapshot', accept));
}
