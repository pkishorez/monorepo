import { Effect } from 'effect';
import { TableSnapshot, type SnapshotChange } from '../../../snapshot/index.js';
import type {
  BackfillChoice,
  CurrentContract,
  StoredContract,
} from './capture.js';
import type { OperationFailure } from '../../std-table/contract/index.js';
import { SetupRefused, type SetupRefusedReason } from './refused.js';
import {
  joinSnapshot,
  type BackfillProgress,
  type ContractRows,
} from './rows.js';
import type { ContractRead } from './store.js';

export type SetupPlan =
  /** The stored contract matches: nothing to prepare beyond the topology. */
  | { readonly kind: 'unchanged' }
  /** Apply the topology and record the contract; `backfill` lists changes owed a backfill. */
  | {
      readonly kind: 'apply';
      readonly backfill: readonly SnapshotChange[];
    }
  /** Disposable only: throw every row away, then apply and record. */
  | { readonly kind: 'wipe'; readonly changes: readonly SnapshotChange[] };

const isRejected = ({ impact }: SnapshotChange) =>
  impact === 'breaking' || impact === 'unverifiable';

/**
 * Decides what setup does, from the stored contract (only its mode and hash
 * at first; the snapshot is loaded when the hash differs) and the current one.
 *
 * - A persistent table never becomes disposable, and never accepts a breaking
 *   or unverifiable change: setup fails and nothing is changed.
 * - A disposable table is wiped on a breaking or unverifiable change, and on
 *   one that needs a backfill unless the adapter can reindex.
 * - A change that needs a backfill passes on a persistent table with a warning.
 */
export const planSetup = <R>(options: {
  readonly current: CurrentContract;
  readonly stored: Pick<StoredContract, 'mode' | 'hash'> | undefined;
  readonly loadStoredSnapshot: Effect.Effect<unknown, unknown, R>;
  /**
   * What a change that needs a backfill does; by default a disposable table
   * is wiped and a persistent one is kept. `keep` keeps either, for a target
   * that can neither wipe nor reindex.
   */
  readonly backfill?: BackfillChoice | 'keep';
}): Effect.Effect<SetupPlan, SetupRefused | unknown, R> =>
  Effect.gen(function* () {
    const { current, stored } = options;
    const name = current.logicalName;
    const mode = current.record.mode;
    if (stored === undefined) {
      yield* Effect.logInfo(
        `std-toolkit: recorded the first contract of ${mode} table "${name}"`,
      );
      return { kind: 'apply', backfill: [] };
    }
    if (stored.mode === 'persistent' && mode === 'disposable')
      return yield* Effect.fail(new SetupRefused(name, 'mode-change'));
    if (stored.hash === current.record.hash && stored.mode === mode)
      return { kind: 'unchanged' };

    // Data written while the table was disposable stays disposable until
    // this setup records it as persistent.
    const dataIsDisposable = stored.mode === 'disposable';
    const previous = yield* options.loadStoredSnapshot.pipe(
      Effect.flatMap(TableSnapshot.parse),
      Effect.result,
    );
    if (previous._tag === 'Failure') {
      if (!dataIsDisposable)
        return yield* Effect.fail(
          new SetupRefused(name, 'unreadable', [], previous.failure),
        );
      return { kind: 'wipe', changes: [] };
    }
    const changes = TableSnapshot.diff(previous.success, current.snapshot);
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

/** What setup does with the table, decided before it changes anything. */
export type ContractPlan =
  /** No contract and no rows: record one, every Backfill done. */
  | { readonly kind: 'create'; readonly clear: boolean }
  /** Throw every row away, then record a fresh contract. */
  | { readonly kind: 'wipe'; readonly changes: readonly SnapshotChange[] }
  /** Apply the changes, run the pending Backfills, then record the contract. */
  | {
      readonly kind: 'apply';
      readonly previous: TableSnapshot;
      readonly changes: readonly SnapshotChange[];
      readonly pending: readonly string[];
      /** The Backfill rows whose progress still counts, to resume from. */
      readonly progress: readonly BackfillProgress[];
      readonly stored: ContractRows;
    };

type Backfill = TableSnapshot['backfills'][number];

/** Whether a pending Backfill rewrites the rows a change needs rewritten. */
const coveredBy = (
  snapshot: TableSnapshot,
  pending: readonly Backfill[],
  change: SnapshotChange,
): boolean => {
  const reindexes = (entity: string) =>
    pending.some(
      (backfill) => backfill.kind === 'reindex' && backfill.entity === entity,
    );
  const { subject } = change;
  switch (subject.kind) {
    case 'version': {
      const entities = snapshot.entities
        .filter(({ schema }) => schema === subject.name)
        .map(({ name }) => name);
      return pending.some(
        (backfill) =>
          backfill.kind === 'gap' &&
          backfill.to === subject.version &&
          entities.includes(backfill.entity),
      );
    }
    case 'access-pattern':
      return subject.owner !== undefined && reindexes(subject.owner);
    case 'local-secondary-index':
    case 'global-secondary-index':
      // Only the entities with an access pattern on the index have rows in it.
      return snapshot.entities
        .filter(({ accessPatterns }) =>
          accessPatterns.some(({ index }) => index === subject.name),
        )
        .every(({ name }) => reindexes(name));
    default:
      return false;
  }
};

/**
 * Decides what setup does from the Stored contract's rows and the current
 * contract (ADR 0019, 0021):
 *
 * - No contract: an empty table records one; a table holding rows is
 *   refused if persistent and wiped if disposable.
 * - A persistent table never becomes disposable, and refuses a breaking or
 *   unverifiable change, and one needing a Backfill that no pending Backfill
 *   covers.
 * - A disposable table never runs a Backfill: any change its rows cannot take
 *   wipes it.
 * - A change the adapter's topology cannot make is refused in either mode.
 */
export const planContract = (options: {
  readonly current: CurrentContract;
  /** The mode the table row records, when it could be read. */
  readonly storedMode: StoredContract['mode'] | undefined;
  readonly read: ContractRead;
  readonly holdsRows: Effect.Effect<boolean, OperationFailure>;
  readonly refuses?: (change: SnapshotChange) => SetupRefusedReason | undefined;
}): Effect.Effect<ContractPlan, SetupRefused | OperationFailure> =>
  Effect.gen(function* () {
    const { current, read } = options;
    const name = current.logicalName;
    const mode = current.record.mode;
    if (options.storedMode === 'persistent' && mode === 'disposable')
      return yield* Effect.fail(new SetupRefused(name, 'mode-change'));
    // Data written while the table was disposable stays disposable until
    // this setup records it as persistent.
    const dataIsDisposable =
      options.storedMode === undefined
        ? mode === 'disposable'
        : options.storedMode === 'disposable';
    if (read.kind === 'unreadable') {
      if (options.storedMode !== 'disposable')
        return yield* Effect.fail(
          new SetupRefused(name, 'unreadable', [], read.cause),
        );
      return { kind: 'wipe', changes: [] };
    }
    const previous = joinSnapshot(read.rows);
    if (previous === undefined) {
      const reserved =
        read.rows.entities.length +
        read.rows.versions.length +
        read.rows.backfills.length;
      if (!(yield* options.holdsRows))
        return { kind: 'create', clear: reserved > 0 };
      if (mode === 'persistent')
        return yield* Effect.fail(new SetupRefused(name, 'no-contract'));
      return { kind: 'wipe', changes: [] };
    }
    const parsed = yield* TableSnapshot.serialize(previous).pipe(
      Effect.flatMap(TableSnapshot.parse),
      Effect.result,
    );
    if (parsed._tag === 'Failure') {
      if (!dataIsDisposable)
        return yield* Effect.fail(
          new SetupRefused(name, 'unreadable', [], parsed.failure),
        );
      return { kind: 'wipe', changes: [] };
    }
    const changes = TableSnapshot.diff(parsed.success, current.snapshot);
    const refusal = changes.flatMap((change) => {
      const reason = options.refuses?.(change);
      return reason === undefined ? [] : [{ change, reason }];
    });
    if (refusal.length > 0)
      return yield* Effect.fail(
        new SetupRefused(
          name,
          refusal[0]!.reason,
          refusal.map(({ change }) => change),
        ),
      );
    const unsafe = changes.filter(({ impact }) => impact !== 'safe');
    if (dataIsDisposable)
      return unsafe.length > 0
        ? { kind: 'wipe', changes: unsafe }
        : {
            kind: 'apply',
            previous: parsed.success,
            changes,
            pending: [],
            progress: [],
            stored: read.rows,
          };
    const rejected = changes.filter(isRejected);
    if (rejected.length > 0)
      return yield* Effect.fail(new SetupRefused(name, 'breaking', rejected));
    // Progress counts only if a committed contract lists its Backfill as
    // done, or it was made toward this very contract: a Backfill that ran
    // for an upgrade that never committed, toward a contract since changed,
    // starts over.
    const committed = new Set(read.rows.table?.value.backfills ?? []);
    const progress = read.rows.backfills.filter(
      (row) =>
        (committed.has(row.id) && row.status === 'done') ||
        row.target === current.record.hash,
    );
    const done = new Set(
      progress.filter(({ status }) => status === 'done').map(({ id }) => id),
    );
    // Only a committed contract's Backfills are trusted. One done toward an
    // upgrade that never committed runs again as a check pass from the
    // start: an old client may have written an old row since.
    const trusted = new Set(
      progress
        .filter(({ id, status }) => status === 'done' && committed.has(id))
        .map(({ id }) => id),
    );
    const pending = current.snapshot.backfills.filter(
      ({ id }) => !trusted.has(id),
    );
    // A Backfill covers a change until a committed contract lists it: one
    // that finished during this upgrade, before a later step failed, still
    // does, or a retry could never resume.
    const covering = current.snapshot.backfills.filter(
      ({ id }) => !done.has(id) || !committed.has(id),
    );
    const uncovered = changes.filter(
      (change) =>
        change.impact === 'requires-backfill' &&
        !coveredBy(current.snapshot, covering, change),
    );
    if (uncovered.length > 0)
      return yield* Effect.fail(
        new SetupRefused(name, 'backfill-missing', uncovered),
      );
    return {
      kind: 'apply',
      previous: parsed.success,
      changes,
      pending: pending.map(({ id }) => id),
      progress,
      stored: read.rows,
    };
  });
