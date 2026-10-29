import { Effect } from 'effect';
import { findOutdatedVersion } from '../../../eschema/index.js';
import { TableSnapshot, type SnapshotChange } from '../../../snapshot/index.js';
import type { CurrentContract, StoredContract } from './capture.js';
import type { OperationFailure } from '../../std-table/contract/index.js';
import { SetupRefused, type SetupRefusedReason } from './refused.js';
import {
  joinSnapshot,
  type BackfillProgress,
  type ContractRows,
} from './rows.js';
import type { ContractRead } from './store.js';

const isRejected = ({ impact }: SnapshotChange) =>
  impact === 'breaking' || impact === 'unverifiable';

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
 * What the stored contract knows that the current one does not: a version
 * of an ESchema, an entity, or a Backfill. Newer code wrote it, since a
 * shipped version, entity or Backfill is never removed.
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
  const backfills = new Set(current.backfills.map(({ id }) => id));
  return [
    ...stored.entities
      .filter(({ name }) => !entities.has(name))
      .map(({ name }) => `entity ${name}`),
    ...stored.schemas.flatMap(({ identity, versions: storedVersions }) =>
      storedVersions
        .filter(({ version }) => versions.get(identity)?.has(version) !== true)
        .map(({ version }) => `${identity} ${version}`),
    ),
    ...stored.backfills
      .filter(({ id }) => !backfills.has(id))
      .map(({ id }) => `Backfill "${id}"`),
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
      : `Its Stored contract knows what this code does not: ${unknown.join(', ')}. If this code removed them on purpose, that is a breaking change: a shipped version, entity or Backfill is never removed.`,
  );

/**
 * Decides what setup does from the Stored contract's rows and the current
 * contract (ADR 0019, 0021):
 *
 * - No contract: an empty table records one; a table holding rows is
 *   refused if persistent and wiped if disposable.
 * - A persistent table never becomes disposable, and refuses a breaking or
 *   unverifiable change, and one needing a Backfill that no pending Backfill
 *   covers.
 * - A disposable table never runs a Backfill: any change its rows cannot
 *   take, and any pending Backfill (a gap or a reindex), wipes it.
 * - A contract that cannot be read is refused if the table is persistent and
 *   wiped if disposable, by the stored mode or, when that cannot be read
 *   either, the current one.
 * - A persistent table whose contract newer code wrote (it knows a version,
 *   entity or Backfill this code does not, or is in a newer format) is
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
    const unsafe = changes.filter(({ impact }) => impact !== 'safe');
    // A Backfill exists because derived rows are wrong until it runs: a
    // reindex beside a migration that changes an indexed field classifies
    // every change as safe, and still leaves queries missing rows.
    if (dataIsDisposable)
      return unsafe.length > 0 || pending.length > 0
        ? { kind: 'wipe', changes: unsafe.length > 0 ? unsafe : changes }
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
