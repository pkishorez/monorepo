import { Effect } from 'effect';
import { nextUlid } from '../../../core/index.js';
import {
  Snapshot,
  SnapshotDecodeError,
  SnapshotIncompatible,
} from '../../../snapshot/index.js';
import type { SnapshotChange, TableSnapshot } from '../../../snapshot/index.js';
import type {
  ContractFailure,
  EncodedData,
  ItemCondition,
  StdTableContract,
} from '../contract/index.js';
import { ConditionFailure } from '../contract/index.js';
import { DatabaseError, OperationFailed } from '../error/index.js';
import { ENFORCEMENT_ENTITY, ENFORCEMENT_KEY } from '../key/index.js';
import { TableBaselineESchema, type TableBaseline } from './baseline.js';

const REJECTED_IMPACTS = new Set(['breaking', 'unverifiable']);
const CONFLICT_RETRIES = 3;

/**
 * Raised when a table already holds rows but carries no enforcement
 * baseline. Nothing can prove those rows match the code, so setup refuses
 * rather than bless whatever shape happens to be deployed. The only ways
 * forward are a new logical table or a wipe.
 */
export class BaselineMissing extends Error {
  readonly _tag = 'BaselineMissing';

  constructor(readonly logicalName: string) {
    super(
      `Table "${logicalName}" already holds rows but has no enforcement baseline; setup cannot prove they match the current shape. Move the data to a new table or wipe this one.`,
    );
    this.name = 'BaselineMissing';
  }
}

/**
 * The two adapter-specific halves of preparing a physical table. `ensure`
 * makes the table or store exist so the baseline can be read; `reconcile`
 * brings its indexes in line with the topology and runs only after the diff
 * has been accepted, so a refused change never alters physical topology.
 */
export interface PhysicalSetup<E> {
  readonly ensure: Effect.Effect<void, E>;
  readonly reconcile: Effect.Effect<void, E>;
}

export type SetupError =
  | DatabaseError
  | SnapshotIncompatible
  | SnapshotDecodeError
  | BaselineMissing;

interface StoredBaseline {
  readonly baseline: TableBaseline;
  readonly updated: string;
}

const dbError = (failure: ContractFailure): DatabaseError =>
  new DatabaseError({
    reason: new OperationFailed({
      operation: 'setup',
      cause: failure instanceof ConditionFailure ? failure : failure.cause,
    }),
  });

const readBaseline = (
  contract: StdTableContract,
): Effect.Effect<
  StoredBaseline | undefined,
  DatabaseError | SnapshotDecodeError
> =>
  contract.getItem(ENFORCEMENT_KEY, { consistent: true }).pipe(
    Effect.mapError(dbError),
    Effect.flatMap((item) =>
      item === null
        ? Effect.succeed(undefined)
        : TableBaselineESchema.decode(item.data).pipe(
            Effect.map((baseline) => ({ baseline, updated: item.meta._u })),
            Effect.mapError(
              (cause) =>
                new SnapshotDecodeError(
                  `The enforcement baseline stored in the table cannot be read: ${cause.message}`,
                  cause,
                ),
            ),
          ),
    ),
  );

const hasRows = (
  contract: StdTableContract,
): Effect.Effect<boolean, DatabaseError> =>
  contract.scanItems({ limit: 1 }).pipe(
    Effect.map((page) => page.items.length > 0),
    Effect.mapError(dbError),
  );

const writeBaseline = (
  contract: StdTableContract,
  baseline: TableBaseline,
  condition: ItemCondition,
): Effect.Effect<boolean, DatabaseError> =>
  Effect.gen(function* () {
    const updated = yield* nextUlid;
    const data = yield* Effect.orDie(TableBaselineESchema.encode(baseline));
    const result = yield* contract
      .writeItem({
        item: {
          pk: ENFORCEMENT_KEY.pk,
          sk: ENFORCEMENT_KEY.sk,
          meta: { _e: ENFORCEMENT_ENTITY, _u: updated, _d: false },
          data: data as unknown as EncodedData,
          keys: {},
        },
        condition,
      })
      .pipe(Effect.result);
    if (result._tag === 'Success') return true;
    if (result.failure instanceof ConditionFailure) return false;
    return yield* Effect.fail(dbError(result.failure));
  });

const latestVersions = (snapshot: TableSnapshot): ReadonlyMap<string, string> =>
  new Map(
    snapshot.schemas.map((definition) => [
      definition.identity,
      definition.versions.at(-1)?.version ?? 'v1',
    ]),
  );

/** A fresh entity has no rows, so its floor is its latest version. */
const nextFloors = (
  snapshot: TableSnapshot,
  existing: Readonly<Record<string, string>>,
): Record<string, string> => {
  const latest = latestVersions(snapshot);
  return Object.fromEntries(
    snapshot.entities.map((entity) => [
      entity.name,
      existing[entity.name] ?? latest.get(entity.schema) ?? 'v1',
    ]),
  );
};

const subjectExists = (
  snapshot: TableSnapshot,
  change: SnapshotChange,
): boolean => {
  const { subject } = change;
  switch (subject.kind) {
    case 'local-secondary-index':
      return snapshot.topology.localSecondaryIndexes.some(
        ({ name }) => name === subject.name,
      );
    case 'global-secondary-index':
      return snapshot.topology.globalSecondaryIndexes.some(
        ({ name }) => name === subject.name,
      );
    case 'access-pattern':
      return snapshot.entities.some(
        (entity) =>
          entity.name === subject.owner &&
          entity.accessPatterns.some(({ name }) => name === subject.name),
      );
    default:
      return true;
  }
};

const nextOwedBackfills = (
  snapshot: TableSnapshot,
  existing: TableBaseline['owedBackfills'],
  changes: readonly SnapshotChange[],
  accepted: string,
): TableBaseline['owedBackfills'] => [
  ...existing.filter(({ change }) => subjectExists(snapshot, change)),
  ...changes
    .filter((change) => change.impact === 'requires-backfill')
    .map((change) => ({ accepted, change })),
];

const setupOnce = <E>(
  contract: StdTableContract,
  current: TableSnapshot,
  physical: PhysicalSetup<E>,
): Effect.Effect<boolean, E | SetupError> =>
  Effect.gen(function* () {
    const stored = yield* readBaseline(contract);
    if (stored === undefined) {
      if (yield* hasRows(contract)) {
        return yield* Effect.fail(new BaselineMissing(current.logicalName));
      }
      yield* physical.reconcile;
      const written = yield* writeBaseline(
        contract,
        {
          snapshot: current,
          floors: nextFloors(current, {}),
          owedBackfills: [],
        },
        { kind: 'not-exists' },
      );
      if (!written) return false;
      yield* Effect.logInfo(
        `std-toolkit: captured the enforcement baseline for table "${current.logicalName}" for the first time`,
      );
      return true;
    }

    const changes = Snapshot.diff(stored.baseline.snapshot, current);
    const rejected = changes.filter((change) =>
      REJECTED_IMPACTS.has(change.impact),
    );
    if (rejected.length > 0) {
      return yield* Effect.fail(new SnapshotIncompatible(rejected));
    }
    yield* physical.reconcile;
    if (changes.length === 0) return true;

    const accepted = yield* nextUlid;
    const written = yield* writeBaseline(
      contract,
      {
        snapshot: current,
        floors: nextFloors(current, stored.baseline.floors),
        owedBackfills: nextOwedBackfills(
          current,
          stored.baseline.owedBackfills,
          changes,
          accepted,
        ),
      },
      { kind: 'updated', value: stored.updated },
    );
    if (!written) return false;
    for (const change of changes) {
      if (change.impact === 'requires-backfill') {
        yield* Effect.logWarning(
          `std-toolkit: snapshot change requires a backfill (${change.subject.kind}${
            change.subject.name === undefined ? '' : ` "${change.subject.name}"`
          })`,
        );
      }
    }
    return true;
  });

/**
 * The only door to a physical table. Makes it exist, reads the enforcement
 * baseline stored inside it, diffs the table's current code-derived snapshot
 * against that baseline, and only then reconciles physical topology and
 * commits the new baseline. A `breaking` or `unverifiable` change refuses and
 * leaves data, topology, and baseline untouched; rows without a baseline
 * refuse too. There is no flag around any of this.
 */
export function setupTable<E>(
  contract: StdTableContract,
  current: TableSnapshot,
  physical: PhysicalSetup<E>,
): Effect.Effect<void, E | SetupError> {
  return Effect.gen(function* () {
    yield* physical.ensure;
    for (let attempt = 0; attempt <= CONFLICT_RETRIES; attempt++) {
      if (yield* setupOnce(contract, current, physical)) return;
    }
    return yield* Effect.fail(dbError(new ConditionFailure({})));
  });
}
