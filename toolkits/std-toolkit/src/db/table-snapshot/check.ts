import { Effect } from 'effect';
import { TableSnapshot, type SnapshotChange } from '../../snapshot/index.js';
import {
  ConditionFailure,
  type ContractFailure,
  type StdTableContract,
} from '../std-table/contract/index.js';
import {
  SetupRefused,
  type BackfillChoice,
  type TableMode,
} from './refusal.js';
import { joinTableSnapshot, splitTableSnapshot } from './split.js';
import {
  decodeStoredItems,
  hasStoredItems,
  readStoredSnapshot,
  recordedSnapshot,
  storedMode,
  tableHasRows,
  writeTableSnapshot,
  type StoredSnapshot,
} from './stored.js';

export type TableSnapshotPlan =
  /** No snapshot was stored: the code's is the table's first. `adopted` when the table already had rows, kept under it. */
  | { readonly kind: 'first'; readonly adopted: boolean }
  /** The stored snapshot and mode match the code's. */
  | { readonly kind: 'unchanged' }
  /** The change keeps every stored row readable; `backfill` lists changes owed a backfill. */
  | {
      readonly kind: 'apply';
      readonly backfill: readonly SnapshotChange[];
    }
  /** Disposable only: every row was thrown away before the snapshot was written. */
  | { readonly kind: 'wipe'; readonly changes: readonly SnapshotChange[] };

export interface PlanOptions<E, R> {
  /** The stored items, as `readStoredSnapshot` read them. */
  readonly stored: StoredSnapshot;
  /** The code's table snapshot. */
  readonly current: TableSnapshot;
  readonly mode: TableMode;
  /**
   * Whether the table holds rows; asked only when none of the internal
   * entities' items is stored.
   */
  readonly hasRows: Effect.Effect<boolean, E, R>;
  /**
   * What a change that needs a backfill does; by default a disposable table
   * is wiped and a persistent one is kept. `keep` keeps either, for a target
   * that can neither wipe nor reindex.
   */
  readonly backfill?: BackfillChoice | 'keep';
}

const isRejected = ({ impact }: SnapshotChange) =>
  impact === 'breaking' || impact === 'unverifiable';

// The type requires a mode; this catches a caller the types do not reach.
const requireMode = (table: string, mode: unknown) =>
  mode === 'persistent' || mode === 'disposable'
    ? Effect.void
    : Effect.die(
        new Error(
          `std-toolkit: table "${table}" has no mode. Declare it 'persistent' or 'disposable'.`,
        ),
      );

/**
 * Decides what setup does, from the stored items and the code's snapshot.
 * It writes nothing.
 *
 * - With no stored snapshot, a table with no rows takes the code's as its
 *   first; one with rows keeps them when persistent and is wiped when
 *   disposable. Entity or version items with no `__snapshot` are a stored
 *   snapshot under the code's topology, with data taken as persistent.
 * - A persistent table never becomes disposable, and never accepts a breaking
 *   or unverifiable change, nor a snapshot it cannot read.
 * - A disposable table is wiped on a breaking or unverifiable change, on a
 *   snapshot it cannot read, and on one that needs a backfill unless the
 *   adapter can reindex. Data written while the table was disposable stays
 *   disposable until this setup records it as persistent.
 * - A change that needs a backfill passes on a persistent table with a warning.
 */
export const planTableSnapshot = <E, R>(
  options: PlanOptions<E, R>,
): Effect.Effect<TableSnapshotPlan, SetupRefused | E, R> =>
  Effect.gen(function* () {
    const { stored, current, mode } = options;
    const name = current.logicalName;
    yield* requireMode(name, mode);
    if (!hasStoredItems(stored)) {
      const rows = yield* options.hasRows;
      if (!rows) {
        yield* Effect.logInfo(
          `std-toolkit: recorded the first snapshot of ${mode} table "${name}"`,
        );
        return { kind: 'first', adopted: false };
      }
      if (mode === 'persistent') {
        yield* Effect.logInfo(
          `std-toolkit: persistent table "${name}" had rows but no snapshot; kept them under the current one`,
        );
        return { kind: 'first', adopted: true };
      }
      return { kind: 'wipe', changes: [] };
    }
    const record = recordedSnapshot(stored);
    // With entity or version items but no `__snapshot`, which only a write
    // under an earlier order leaves, what is there is still the baseline. Its
    // mode is unknown, so its data is taken as persistent, and the code's
    // topology stands in for the one it lacks.
    const previousMode = record === null ? undefined : storedMode(record);
    if (previousMode === 'persistent' && mode === 'disposable')
      return yield* Effect.fail(new SetupRefused(name, 'mode-change'));

    const dataIsDisposable = previousMode === 'disposable';
    const previous = yield* decodeStoredItems(stored).pipe(
      Effect.flatMap(({ snapshot, ...rest }) =>
        joinTableSnapshot({
          ...rest,
          snapshot:
            snapshot ?? splitTableSnapshot(current, 'persistent').snapshot,
        }),
      ),
      Effect.result,
    );
    if (previous._tag === 'Failure') {
      if (!dataIsDisposable)
        return yield* Effect.fail(
          new SetupRefused(name, 'unreadable', [], previous.failure),
        );
      return { kind: 'wipe', changes: [] };
    }
    const changes = TableSnapshot.diff(previous.success.snapshot, current);
    if (changes.length === 0 && previousMode === mode)
      return { kind: 'unchanged' };
    const rejected = changes.filter(isRejected);
    const backfill = changes.filter(
      ({ impact }) => impact === 'requires-backfill',
    );
    if (rejected.length > 0) {
      if (!dataIsDisposable)
        return yield* Effect.fail(new SetupRefused(name, 'breaking', rejected));
      return { kind: 'wipe', changes: rejected };
    }
    if (backfill.length > 0) {
      const choice = options.backfill ?? (dataIsDisposable ? 'wipe' : 'keep');
      if (dataIsDisposable && choice === 'wipe')
        return { kind: 'wipe', changes: backfill };
      if (choice !== 'reindex')
        yield* Effect.logWarning(
          `std-toolkit: table "${name}" has changes that need a backfill. Rows stored before them are missing from the new access patterns until they are reindexed:\n${TableSnapshot.renderChanges(backfill)}`,
        );
    }
    return { kind: 'apply', backfill };
  });

export interface CheckOptions<E, R> {
  /** The physical table, through the StdTable contract. */
  readonly contract: StdTableContract;
  /** The code's table snapshot. */
  readonly snapshot: TableSnapshot;
  readonly mode: TableMode;
  /**
   * The order the table declares its local secondary indexes in, which
   * `__snapshot` keeps; by default the snapshot's, by name.
   */
  readonly localIndexOrder?: readonly string[];
  /**
   * Throws every row of a disposable table away, leaving it empty and
   * writable. Whether it keeps the internal entities' items does not matter:
   * they are read again after it. It is given the items the plan was made
   * from: an adapter that can should wipe only while `__snapshot` is still
   * the one read, and fail with `ConditionFailure` otherwise, so a setup
   * deciding on a stale read never wipes a table another setup just made
   * persistent; the check then starts over from the read.
   */
  readonly wipe: (stored: StoredSnapshot) => Effect.Effect<void, E, R>;
  /**
   * Whether the table holds rows, asked only when none of the internal
   * entities' items is stored. By default it scans the contract for an item
   * of any app entity.
   */
  readonly hasRows?: Effect.Effect<boolean, E, R>;
  readonly backfill?: BackfillChoice | 'keep';
  /**
   * Runs once the plan is made and any wipe is done, before the snapshot is
   * written, with the items the write will be conditioned on. An adapter that
   * backfills does it here, so a setup stopped before the write owes the
   * backfill again on its next run. A wipe it makes must keep the internal
   * entities' items, and hold only while `__snapshot` is still the one read.
   */
  readonly prepare?: (
    plan: TableSnapshotPlan,
    stored: StoredSnapshot,
  ) => Effect.Effect<void, E, R>;
}

/** How many times setup starts over after another setup wrote first. */
const RETRIES = 3;

const isConditionFailure = (cause: unknown): cause is ConditionFailure =>
  cause instanceof ConditionFailure;

/**
 * Checks a physical table against the code's snapshot, using the snapshot
 * the table keeps in its own internal entities (ADR 0020), and records the
 * code's. It reads the stored items, plans, and then: refuses with nothing
 * written; or wipes, then writes; or writes. It writes only the items that
 * changed, each under its own condition, in an order where every prefix is a
 * stored snapshot the next run reads (`writeTableSnapshot`). When a
 * condition fails, another setup wrote first: an item it wrote just as this
 * one would is left as it is, and any other starts it over from the read, at
 * most three times. No step needs a transaction.
 *
 * The physical table must exist before it runs; the adapter applies its
 * topology after, as the plan says, or in `prepare`, before the write.
 */
export const checkTableSnapshot = <E = never, R = never>(
  options: CheckOptions<E, R>,
): Effect.Effect<TableSnapshotPlan, SetupRefused | ContractFailure | E, R> => {
  const { contract, snapshot, mode } = options;
  const hasRows: Effect.Effect<boolean, E | ContractFailure, R> =
    options.hasRows ?? tableHasRows(contract);
  const attempt = Effect.gen(function* () {
    let stored = yield* readStoredSnapshot(contract);
    const plan = yield* planTableSnapshot({
      stored,
      current: snapshot,
      mode,
      hasRows,
      ...(options.backfill === undefined ? {} : { backfill: options.backfill }),
    });
    if (plan.kind === 'wipe') {
      yield* Effect.logWarning(
        `std-toolkit: wiped disposable table "${snapshot.logicalName}" for a change its stored rows cannot take`,
      );
      yield* options.wipe(stored);
      stored = yield* readStoredSnapshot(contract);
    }
    if (options.prepare !== undefined) yield* options.prepare(plan, stored);
    yield* writeTableSnapshot(
      contract,
      stored,
      snapshot,
      mode,
      options.localIndexOrder,
    );
    return plan;
  });
  const run = (
    retries: number,
  ): Effect.Effect<TableSnapshotPlan, SetupRefused | ContractFailure | E, R> =>
    attempt.pipe(
      Effect.catchIf(
        (cause) => retries > 0 && isConditionFailure(cause),
        () => run(retries - 1),
      ),
    );
  return run(RETRIES);
};
