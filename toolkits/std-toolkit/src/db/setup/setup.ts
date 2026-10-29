import { Effect } from 'effect';
import type { SnapshotChange, TableSnapshot } from '../../snapshot/index.js';
import type {
  OperationFailure,
  StdTableContract,
} from '../std-table/contract/index.js';
import type { DatabaseError } from '../std-table/error/index.js';
import type { StdTable } from '../std-table/table/index.js';
import {
  captureContract,
  holdsAppRows,
  NO_ROWS,
  planContract,
  readStoredContract,
  recordContract,
  SetupRefused,
  wipeTable,
  type SetupRefusedReason,
  type TableMode,
} from './contract/index.js';
import { reindexEntities } from './reindex/index.js';

// What every adapter runs before a table opens (ADR 0019, 0021, 0022):
// read the Stored contract, plan, apply the topology, reindex, record.

// What a check ahead of setup plans with, by setup's own rules: the table
// test against its committed file, and the deploy guard against its state.
export {
  captureContract,
  contractFromSnapshot,
  isOutdatedCode,
  NO_ROWS,
  planContract,
  recordContract,
  rowsOfContract,
  SetupRefused,
  type ContractPlan,
  type ContractRows,
  type CurrentContract,
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
   * before the reindex, never for an unchanged table. `previous` is the
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
  /** Rows per scan page while reindexing. */
  readonly pageSize?: number;
}

export type SetupOutcome =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'created' }
  | { readonly kind: 'wiped'; readonly changes: readonly SnapshotChange[] }
  | {
      readonly kind: 'applied';
      readonly changes: readonly SnapshotChange[];
      /** The entities this setup reindexed. */
      readonly reindexed: readonly string[];
    };

const applyNothing: SetupTopology = { apply: () => Effect.void };

/**
 * Prepares one physical table under its mode: reads the Stored contract
 * (one read when unchanged), refuses, wipes or applies the change, reindexes
 * the entities an index change touches, and only then records the contract,
 * the table row last. A setup that fails or stops before that leaves the
 * contract as it was, so the next one reindexes again.
 */
export const runSetup = (
  options: SetupOptions,
): Effect.Effect<
  SetupOutcome,
  SetupRefused | DatabaseError | OperationFailure
> =>
  Effect.gen(function* () {
    const { table, store } = options;
    const pageSize = options.pageSize ?? 100;
    // An empty page reads as a finished scan, so a page that cannot hold a
    // row would end the reindex before it read anything.
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
      yield* recordContract(store, { current, stored: NO_ROWS });
      return plan.kind === 'wipe'
        ? ({ kind: 'wiped', changes: plan.changes } as const)
        : ({ kind: 'created' } as const);
    }

    yield* topology.apply({
      previous: plan.previous,
      current: current.snapshot,
      changes: plan.changes,
    });
    yield* reindexEntities({
      table,
      store,
      entities: plan.reindex,
      pageSize,
    });
    yield* recordContract(store, { current, stored: plan.stored });
    return {
      kind: 'applied',
      changes: plan.changes,
      reindexed: plan.reindex,
    } as const;
  });
