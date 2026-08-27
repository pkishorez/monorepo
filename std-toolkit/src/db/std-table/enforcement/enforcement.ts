import { Effect } from 'effect';
import { nextUlid } from '../../../core/index.js';
import { Snapshot, SnapshotIncompatible } from '../../../snapshot/index.js';
import type { TableSnapshot } from '../../../snapshot/index.js';
import type {
  ContractFailure,
  EncodedData,
  ItemCondition,
  StdTableContract,
} from '../contract/index.js';
import { ConditionFailure } from '../contract/index.js';
import { DatabaseError, OperationFailed } from '../error/index.js';
import { ENFORCEMENT_ENTITY, ENFORCEMENT_KEY } from '../key/index.js';

const REJECTED_IMPACTS = new Set(['breaking', 'unverifiable']);
const CONFLICT_RETRIES = 3;

interface Baseline {
  readonly snapshot: TableSnapshot;
  readonly updated: string;
}

const dbError = (operation: string, failure: ContractFailure): DatabaseError =>
  new DatabaseError({
    reason: new OperationFailed({
      operation,
      cause: failure instanceof ConditionFailure ? failure : failure.cause,
    }),
  });

const readBaseline = (
  contract: StdTableContract,
): Effect.Effect<Baseline | undefined, DatabaseError> =>
  contract.getItem(ENFORCEMENT_KEY, { consistent: true }).pipe(
    Effect.map((item) =>
      item === null
        ? undefined
        : {
            snapshot: item.data as unknown as TableSnapshot,
            updated: item.meta._u,
          },
    ),
    Effect.mapError((error) => dbError('verifySnapshot', error)),
  );

const writeBaseline = (
  contract: StdTableContract,
  snapshot: TableSnapshot,
  condition: ItemCondition,
): Effect.Effect<boolean, DatabaseError> =>
  Effect.gen(function* () {
    const updated = yield* nextUlid;
    const result = yield* contract
      .writeItem({
        item: {
          pk: ENFORCEMENT_KEY.pk,
          sk: ENFORCEMENT_KEY.sk,
          meta: { _e: ENFORCEMENT_ENTITY, _u: updated, _d: false },
          data: snapshot as unknown as EncodedData,
          keys: {},
        },
        condition,
      })
      .pipe(Effect.result);
    if (result._tag === 'Success') return true;
    if (result.failure instanceof ConditionFailure) return false;
    return yield* Effect.fail(dbError('verifySnapshot', result.failure));
  });

const verifyOnce = (
  contract: StdTableContract,
  current: TableSnapshot,
): Effect.Effect<boolean, DatabaseError | SnapshotIncompatible> =>
  Effect.gen(function* () {
    const baseline = yield* readBaseline(contract);
    if (baseline === undefined) {
      const written = yield* writeBaseline(contract, current, {
        kind: 'not-exists',
      });
      if (!written) return false;
      yield* Effect.logInfo(
        `std-toolkit: captured the enforcement baseline for table "${current.logicalName}" for the first time`,
      );
      return true;
    }

    const changes = Snapshot.diff(baseline.snapshot, current);
    const rejected = changes.filter((change) =>
      REJECTED_IMPACTS.has(change.impact),
    );
    if (rejected.length > 0) {
      return yield* Effect.fail(new SnapshotIncompatible(rejected));
    }
    if (changes.length === 0) return true;

    const written = yield* writeBaseline(contract, current, {
      kind: 'updated',
      value: baseline.updated,
    });
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
 * Reads the enforcement baseline stored inside the table itself, diffs it
 * against the table's current, code-derived snapshot, and keeps the baseline
 * current when the diff is safe. A `breaking` or `unverifiable` change
 * rejects — the baseline is never written in that case, so a live table
 * cannot silently absorb a change it cannot prove is compatible. This is
 * independent of the file-based CLI lint: it needs nothing outside the table
 * itself to protect a deployed table.
 */
export function verifyTableSnapshot(
  contract: StdTableContract,
  current: TableSnapshot,
): Effect.Effect<void, DatabaseError | SnapshotIncompatible> {
  return Effect.gen(function* () {
    for (let attempt = 0; attempt <= CONFLICT_RETRIES; attempt++) {
      if (yield* verifyOnce(contract, current)) return;
    }
    return yield* Effect.fail(
      dbError('verifySnapshot', new ConditionFailure({})),
    );
  });
}
