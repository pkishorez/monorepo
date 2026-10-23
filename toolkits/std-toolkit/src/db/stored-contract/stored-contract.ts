import { Effect } from 'effect';
import {
  TableSnapshot,
  type SnapshotChange,
  type TableSource,
} from '../../snapshot/index.js';

/**
 * Whether a physical table's data must survive every schema change
 * (`persistent`) or may be thrown away when one is not safe (`disposable`).
 */
export type TableMode = 'persistent' | 'disposable';

/** What a physical table keeps beside its data: the snapshot it was set up under. */
export interface StoredContract {
  readonly mode: TableMode;
  readonly hash: string;
  /** The serialized table snapshot. */
  readonly snapshot: unknown;
}

/** The current table, captured once for one setup. */
export interface CurrentContract {
  readonly logicalName: string;
  readonly snapshot: TableSnapshot;
  readonly record: StoredContract;
}

/** What a disposable table does with a change that needs a backfill. */
export type BackfillChoice = 'reindex' | 'wipe';

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

export type SetupRefusedReason =
  | 'breaking'
  | 'mode-change'
  | 'unreadable'
  | 'replaces-table';

/**
 * Setup refused to touch a persistent table. It never wipes: the fix is a
 * code change, or a new physical table name.
 */
export class SetupRefused extends Error {
  readonly _tag = 'SetupRefused';

  constructor(
    readonly table: string,
    readonly reason: SetupRefusedReason,
    readonly changes: readonly SnapshotChange[] = [],
    readonly cause?: unknown,
  ) {
    super(refusalMessage(table, reason, changes));
    this.name = 'SetupRefused';
  }
}

const refusalMessage = (
  table: string,
  reason: SetupRefusedReason,
  changes: readonly SnapshotChange[],
) => {
  switch (reason) {
    case 'breaking':
      return [
        `std-toolkit: persistent table "${table}" cannot be set up: its stored data was written under a contract this change breaks.`,
        '',
        TableSnapshot.renderChanges(changes),
        '',
        'Nothing was changed. Undo the edit and add the change as a new version, or move the data to a new physical table name.',
      ].join('\n');
    case 'mode-change':
      return `std-toolkit: table "${table}" is persistent and cannot become disposable. Nothing was changed. Use a new physical table name to start a disposable table.`;
    case 'replaces-table':
      return [
        `std-toolkit: table "${table}" cannot take this change in place: the database can only make it by replacing the table, which deletes its data. Nothing was changed. Add a global secondary index instead, or use a new physical table name.`,
        ...(changes.length === 0
          ? []
          : ['', TableSnapshot.renderChanges(changes)]),
      ].join('\n');
    case 'unreadable':
      return `std-toolkit: persistent table "${table}" has a stored contract this version of std-toolkit cannot read, so its data cannot be checked. Nothing was changed.`;
  }
};

// cyrb53: a fast, non-cryptographic 53-bit hash. A collision only costs a
// skipped comparison, never a wrong one: an equal hash means equal JSON in
// every case a deploy will meet.
const hash = (text: string) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

// The type requires a mode; this catches a caller the types do not reach.
const requireMode = (table: string, mode: unknown) =>
  mode === 'persistent' || mode === 'disposable'
    ? Effect.void
    : Effect.die(
        new Error(
          `std-toolkit: table "${table}" has no mode. Declare it 'persistent' or 'disposable'.`,
        ),
      );

/** Captures the table's contract as setup records it. */
export const captureContract = (
  table: TableSource,
  mode: TableMode,
): Effect.Effect<CurrentContract> =>
  Effect.gen(function* () {
    yield* requireMode(table.logicalName, mode);
    const snapshot = TableSnapshot.capture(table);
    const serialized = yield* TableSnapshot.serialize(snapshot).pipe(
      Effect.orDie,
    );
    return {
      logicalName: table.logicalName,
      snapshot,
      record: {
        mode,
        hash: hash(JSON.stringify(serialized)),
        snapshot: serialized,
      },
    };
  });

/** Reads a contract already serialized, such as one carried by a deploy resource. */
export const contractFromSnapshot = (
  serialized: unknown,
  mode: TableMode,
): Effect.Effect<CurrentContract, unknown> =>
  Effect.gen(function* () {
    const snapshot = yield* TableSnapshot.parse(serialized);
    yield* requireMode(snapshot.logicalName, mode);
    return {
      logicalName: snapshot.logicalName,
      snapshot,
      record: {
        mode,
        hash: hash(JSON.stringify(serialized)),
        snapshot: serialized,
      },
    };
  });

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
