import { Clock, Effect } from 'effect';
import type { SnapshotChange, TableSnapshot } from '../../snapshot/index.js';
import type {
  OperationFailure,
  StdTableContract,
} from '../std-table/contract/index.js';
import type { StdTable } from '../std-table/table/index.js';
import {
  planBackfills,
  runBackfills,
  type BackfillFailed,
  type BackfillState,
} from './backfill/index.js';
import {
  captureContract,
  holdsAppRows,
  NO_ROWS,
  planContract,
  readStoredContract,
  recordContract,
  recordProgress,
  SetupRefused,
  wipeTable,
  type SetupRefusedReason,
  type TableMode,
} from './contract/index.js';

// What every adapter runs before a table opens (ADR 0019, 0020, 0021):
// read the Stored contract, plan, run the pending Backfills, record.

export { BackfillFailed } from './backfill/index.js';
// What adapters still call directly until they move to runSetup.
export {
  captureContract,
  contractFromSnapshot,
  planSetup,
  SetupRefused,
  type BackfillChoice,
  type CurrentContract,
  type SetupPlan,
  type SetupRefusedReason,
  type StoredContract,
  type TableMode,
} from './contract/index.js';

/**
 * The adapter's own topology: SQL indexes, IndexedDB stores, DynamoDB
 * indexes. Everything else in setup is shared.
 */
export interface SetupTopology {
  /**
   * Makes the native topology match `current`. Runs after the plan and
   * before any Backfill, never for an unchanged table. `previous` is the
   * contract the data was under, absent for a new or wiped table.
   */
  readonly apply: (topology: {
    readonly previous: TableSnapshot | undefined;
    readonly current: TableSnapshot;
    readonly changes: readonly SnapshotChange[];
  }) => Effect.Effect<void, OperationFailure>;
  /** Why the adapter cannot make `change`, if it cannot; refused in either mode. */
  readonly refuses?: (change: SnapshotChange) => SetupRefusedReason | undefined;
}

export interface SetupOptions {
  readonly table: StdTable;
  readonly mode: TableMode;
  /** The adapter's StdTable contract over the physical table, which must exist. */
  readonly store: StdTableContract;
  readonly topology?: SetupTopology;
  /** Rows per scan page while backfilling; progress is saved after each. */
  readonly pageSize?: number;
}

export type SetupOutcome =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'created' }
  | { readonly kind: 'wiped'; readonly changes: readonly SnapshotChange[] }
  | {
      readonly kind: 'applied';
      readonly changes: readonly SnapshotChange[];
      /** The Backfills this setup ran, in order. */
      readonly backfills: readonly string[];
    };

const applyNothing: SetupTopology = { apply: () => Effect.void };

const doneNow = (id: string, at: string): BackfillState => ({
  id,
  status: 'done',
  cursor: null,
  rowsRewritten: 0,
  startedAt: null,
  finishedAt: at,
});

const now = Effect.map(Clock.currentTimeMillis, (millis) =>
  new Date(millis).toISOString(),
);

const savedState = (progress: readonly BackfillState[], id: string) =>
  progress.find((row) => row.id === id);

/**
 * Prepares one physical table under its mode: reads the Stored contract
 * (one read when unchanged), refuses, wipes or applies the change, runs
 * every pending Backfill, and only then records the contract, the table row
 * last. A failed Backfill leaves the contract as it was.
 */
export const runSetup = (
  options: SetupOptions,
): Effect.Effect<
  SetupOutcome,
  SetupRefused | BackfillFailed | OperationFailure
> =>
  Effect.gen(function* () {
    const { table, store } = options;
    const pageSize = options.pageSize ?? 100;
    // An empty page reads as a finished scan, so a page that cannot hold a
    // row would mark every Backfill done without rewriting anything.
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      return yield* Effect.die(
        new RangeError(`pageSize must be a positive integer, got ${pageSize}`),
      );
    }
    const topology = options.topology ?? applyNothing;
    const current = yield* captureContract(table, options.mode);
    const stored = yield* readStoredContract(store, current);
    if (stored.kind === 'unchanged') return { kind: 'unchanged' } as const;

    const plan = yield* planContract({
      current,
      storedMode: stored.storedMode,
      read: stored.read,
      holdsRows: holdsAppRows(store),
      ...(topology.refuses === undefined ? {} : { refuses: topology.refuses }),
    });
    const at = yield* now;
    const allDone = (id: string) => doneNow(id, at);

    if (plan.kind !== 'apply') {
      if (plan.kind === 'wipe') {
        yield* Effect.logWarning(
          `std-toolkit: wiped disposable table "${current.logicalName}" for a change its stored rows cannot take`,
        );
        yield* wipeTable(store);
      } else if (plan.clear) yield* wipeTable(store);
      yield* topology.apply({
        previous: undefined,
        current: current.snapshot,
        changes: plan.kind === 'wipe' ? plan.changes : [],
      });
      yield* recordContract(store, {
        current,
        stored: NO_ROWS,
        progress: allDone,
      });
      return plan.kind === 'wipe'
        ? ({ kind: 'wiped', changes: plan.changes } as const)
        : ({ kind: 'created' } as const);
    }

    const stages = yield* planBackfills(table, plan.pending).pipe(
      Effect.mapError(
        (refused) =>
          new SetupRefused(
            current.logicalName,
            'backfill-order',
            [],
            refused,
            refused.detail,
          ),
      ),
    );
    yield* topology.apply({
      previous: plan.previous,
      current: current.snapshot,
      changes: plan.changes,
    });
    const ran = yield* runBackfills({
      table,
      store,
      stages,
      progress: (id) => savedState(plan.progress, id),
      save: (states) => recordProgress(store, current, states),
      pageSize,
    });
    const finished = new Map(ran.map((state) => [state.id, state]));
    yield* recordContract(store, {
      current,
      stored: plan.stored,
      progress: (id) => {
        const saved = savedState(plan.progress, id);
        return (
          finished.get(id) ?? (saved?.status === 'done' ? saved : allDone(id))
        );
      },
    });
    return {
      kind: 'applied',
      changes: plan.changes,
      backfills: ran.map(({ id }) => id),
    } as const;
  });
