import { Effect } from 'effect';
import { findOutdatedVersion } from '../../../eschema/index.js';
import { TableSnapshot, type SnapshotChange } from '../../../snapshot/index.js';
import type { CurrentContract, StoredContract } from './capture.js';
import type { OperationFailure } from '../../std-table/contract/index.js';
import { SetupRefused, type SetupRefusedReason } from './refused.js';
import { joinSnapshot, type ContractRows } from './rows.js';
import type { ContractRead } from './store.js';

const isRejected = ({ impact }: SnapshotChange) =>
  impact === 'breaking' || impact === 'unverifiable';

/** What setup does with the table, decided before it changes anything. */
export type ContractPlan =
  /** No contract and no rows: record one. */
  | { readonly kind: 'create'; readonly clear: boolean }
  /** Throw every row away, then record a fresh contract. */
  | { readonly kind: 'wipe'; readonly changes: readonly SnapshotChange[] }
  /** Apply the changes, reindex, then record the contract. */
  | {
      readonly kind: 'apply';
      readonly previous: TableSnapshot;
      readonly changes: readonly SnapshotChange[];
      /** The entities whose rows the changes leave with stale index keys. */
      readonly reindex: readonly string[];
      readonly stored: ContractRows;
    };

/**
 * The entities a change leaves with stale index keys: the owner of an added
 * or edited access pattern, every entity with an access pattern on an added
 * or edited index. A new version alone never reindexes, since that would
 * scan the table on every release: a row a migration moves to another index
 * key keeps its old key until it is next written. An index nothing queries
 * holds no rows.
 */
const reindexed = (
  snapshot: TableSnapshot,
  changes: readonly SnapshotChange[],
): readonly string[] => {
  const entities = new Set<string>();
  for (const { impact, subject } of changes) {
    if (impact === 'requires-reindex') {
      if (subject.kind === 'access-pattern') entities.add(subject.owner!);
      else
        for (const { name, accessPatterns } of snapshot.entities)
          if (accessPatterns.some(({ index }) => index === subject.name))
            entities.add(name);
    }
  }
  return [...entities].sort();
};

/**
 * What the stored contract knows that the current one does not: a version
 * of an ESchema, or an entity. Newer code wrote it, since a shipped version
 * or entity is never removed.
 */
const unknownToCode = (
  stored: TableSnapshot,
  current: TableSnapshot,
): readonly string[] => {
  const versions = new Map(
    current.schemas.map(({ identity, versions }) => [
      identity,
      new Set(versions.map(({ version }) => version)),
    ]),
  );
  const entities = new Set(current.entities.map(({ name }) => name));
  return [
    ...stored.entities
      .filter(({ name }) => !entities.has(name))
      .map(({ name }) => `entity ${name}`),
    ...stored.schemas.flatMap(({ identity, versions: storedVersions }) =>
      storedVersions
        .filter(({ version }) => versions.get(identity)?.has(version) !== true)
        .map(({ version }) => `${identity} ${version}`),
    ),
  ];
};

const outdatedCode = (name: string, unknown: readonly string[] | undefined) =>
  new SetupRefused(
    name,
    'outdated-code',
    [],
    undefined,
    unknown === undefined
      ? 'Its Stored contract is written in a newer format.'
      : `Its Stored contract knows what this code does not: ${unknown.join(', ')}. If this code removed them on purpose, that is a breaking change: a shipped version or entity is never removed.`,
  );

/**
 * Decides what setup does from the Stored contract's rows and the current
 * contract (ADR 0019, 0021):
 *
 * - No contract: an empty table records one; a table holding rows is
 *   refused if persistent and wiped if disposable.
 * - A persistent table never becomes disposable, and refuses a breaking or
 *   unverifiable change. An index change is applied and its entities
 *   reindexed.
 * - A disposable table is wiped by any change that is not safe, an index
 *   change included.
 * - A contract that cannot be read is refused if the table is persistent and
 *   wiped if disposable, by the stored mode or, when that cannot be read
 *   either, the current one.
 * - A persistent table whose contract newer code wrote (it knows a version,
 *   or entity this code does not, or is in a newer format) is
 *   refused as `outdated-code`. A disposable table is wiped, as for any
 *   change that is not safe.
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
      if (!dataIsDisposable && findOutdatedVersion(read.cause) !== undefined)
        return yield* Effect.fail(outdatedCode(name, undefined));
      if (!dataIsDisposable)
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
        (read.rows.migration === undefined ? 0 : 1);
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
      if (
        !dataIsDisposable &&
        findOutdatedVersion(parsed.failure) !== undefined
      )
        return yield* Effect.fail(outdatedCode(name, undefined));
      if (!dataIsDisposable)
        return yield* Effect.fail(
          new SetupRefused(name, 'unreadable', [], parsed.failure),
        );
      return { kind: 'wipe', changes: [] };
    }
    const changes = TableSnapshot.diff(parsed.success, current.snapshot);
    // Old code meeting a persistent table newer code set up: the diff would
    // read as removals and refuse them as breaking, when the fix is to run
    // the newer code. A disposable table takes them as any unsafe change, and
    // is wiped.
    if (!dataIsDisposable) {
      const unknown = unknownToCode(parsed.success, current.snapshot);
      if (unknown.length > 0)
        return yield* Effect.fail(outdatedCode(name, unknown));
    }
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
    if (dataIsDisposable) {
      const unsafe = changes.filter(({ impact }) => impact !== 'safe');
      if (unsafe.length > 0) return { kind: 'wipe', changes: unsafe };
    } else {
      const rejected = changes.filter(isRejected);
      if (rejected.length > 0)
        return yield* Effect.fail(new SetupRefused(name, 'breaking', rejected));
    }
    return {
      kind: 'apply',
      previous: parsed.success,
      changes,
      reindex: reindexed(current.snapshot, changes),
      stored: read.rows,
    };
  });
