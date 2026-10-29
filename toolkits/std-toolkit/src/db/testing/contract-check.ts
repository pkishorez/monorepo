import { Effect } from 'effect';
import {
  captureContract,
  planBackfills,
  planContract,
  rowsOfContract,
  SetupRefused,
} from '../setup/index.js';
import type { StdTable } from '../std-table/table/index.js';

// Setup's own plan, from the committed file as if it were a persistent
// table's Stored contract with every Backfill it lists done: what setup
// would refuse, `vitest -u` must not accept.

/** The committed file's snapshot. */
type CommittedSnapshot = Parameters<typeof rowsOfContract>[0];

// Reported already, against the file, with advice for a file.
const reportedElsewhere = new Set<SetupRefused['reason']>([
  'breaking',
  'outdated-code',
]);

/** What setup would refuse moving a persistent table from `committed` to `table`; empty when it would not. */
export const findContractRefusals = (
  table: StdTable,
  committed: CommittedSnapshot,
): Effect.Effect<readonly string[]> =>
  Effect.gen(function* () {
    const current = yield* captureContract(table, 'persistent');
    const plan = yield* planContract({
      current,
      storedMode: 'persistent',
      read: {
        kind: 'read',
        rows: rowsOfContract(committed, {
          mode: 'persistent',
          hash: `committed:${current.record.hash}`,
        }),
      },
      holdsRows: Effect.succeed(true),
    });
    if (plan.kind !== 'apply') return [];
    yield* planBackfills(table, plan.pending);
    return [];
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(
        error instanceof SetupRefused && reportedElsewhere.has(error.reason)
          ? []
          : [
              error instanceof SetupRefused
                ? error.message
                : `setup cannot order the pending Backfills: ${(error as Error).message}`,
            ],
      ),
    ),
  );
