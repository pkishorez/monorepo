import { Effect } from 'effect';
import {
  contractLayer,
  OperationFailure,
  type StdTableContract,
  type StoredItem,
} from '../../table/model/contract/index.js';
import { SetupRefused } from '../contract/index.js';
import { fromStoredSingle } from '../../table/entity/index.js';
import { isReservedEntity } from '../../table/model/key/index.js';
import type {
  DatabaseError,
  DatabaseErrorReason,
} from '../../table/model/error/index.js';
import type { StdTable } from '../../table/std-table/index.js';

// Setup's own reindex (ADR 0022): after an index or key derivation changes,
// every row of an affected entity whose index keys drifted is rewritten
// (`drift`, `reindex`, ADR 0007). It keeps no progress: a reindex is
// idempotent, so a setup that stops part-way reindexes again next time.

/** How many times one row is tried while app writes keep moving its `_u`. */
const ATTEMPTS = 3;

const failed = (cause: unknown) =>
  cause instanceof OperationFailure ? cause : new OperationFailure({ cause });

/**
 * Brings one row's index keys up to date, guarded on the `_u` it was read
 * at. Only the keys change: the row keeps its stored data and version, so
 * code still serving the old contract reads it as before. A write since then fails it with `ReindexConflict`: the row is read
 * again and checked again, up to `ATTEMPTS` times.
 */
const reindexRow = (
  table: StdTable,
  store: StdTableContract,
  item: StoredItem,
) =>
  Effect.gen(function* () {
    let read = item;
    for (let attempt = 1; ; attempt++) {
      const { drifted, currentForm } = yield* table.drift(read);
      if (!drifted) return;
      const written = yield* Effect.result(
        table.reindex({ ...read, keys: currentForm.keys }),
      );
      if (written._tag === 'Success') return;
      if (
        written.failure.reason._tag !== 'ReindexConflict' ||
        attempt === ATTEMPTS
      )
        return yield* Effect.fail(written.failure);
      const fresh = yield* store
        .getItem(read, { consistent: true })
        .pipe(Effect.mapError(failed));
      if (fresh === null) return;
      read = fresh;
    }
  });

/**
 * Scans the whole table, strongly consistent, and reindexes every row of
 * `entities`, tombstones included. A row that cannot be read, or keeps
 * conflicting, fails it.
 */
export const reindexEntities = (options: {
  readonly table: StdTable;
  readonly store: StdTableContract;
  readonly entities: readonly string[];
  readonly pageSize: number;
}): Effect.Effect<void, DatabaseError | OperationFailure> =>
  eachRow(options, (item) =>
    new Set(options.entities).has(item.meta._e)
      ? reindexRow(options.table, options.store, item)
      : Effect.void,
  );

/**
 * Adopts a persistent table that holds rows but no Stored contract (ADR
 * 0021): every row must be an entity the table declares and read under its
 * ESchema. Each keyed row's index keys are brought
 * up to date as it goes. The first row that fails stops the adoption; rows
 * already reindexed keep their data, and the next setup adopts again.
 */
export const adoptRows = (options: {
  readonly table: StdTable;
  readonly store: StdTableContract;
  readonly pageSize: number;
}): Effect.Effect<void, SetupRefused | DatabaseError | OperationFailure> =>
  eachRow(options, (item) => {
    if (isReservedEntity(item.meta._e)) return Effect.void;
    const found = options.table.registeredEntities.find(
      (entity) => entity.name === item.meta._e,
    );
    const adopted: Effect.Effect<
      void,
      DatabaseError | OperationFailure,
      Effect.Services<ReturnType<typeof reindexRow>>
    > = found?.kind === 'single'
      ? Effect.asVoid(fromStoredSingle(found.schema, item))
      : reindexRow(options.table, options.store, item);
    return adopted.pipe(
      Effect.catchTag('DatabaseError', (error) =>
        Effect.fail(
          unreadable.has(error.reason._tag)
            ? new SetupRefused(
                options.table.logicalName,
                'unadoptable',
                [],
                error,
                `Row ${item.pk} / ${item.sk}, saved as "${item.meta._e}": ${why(error.reason)}.`,
              )
            : error,
        ),
      ),
    );
  });

/** The reasons a row is not this code's to adopt; any other fails as it is. */
const unreadable = new Set<DatabaseErrorReason['_tag']>([
  'EntityNotFound',
  'DecodeFailed',
  'PrimaryKeyDrift',
]);

const why = (reason: DatabaseErrorReason) => {
  switch (reason._tag) {
    case 'EntityNotFound':
      return 'no entity of that name is declared';
    case 'PrimaryKeyDrift':
      return 'its key is not the one this code derives from its value';
    case 'DecodeFailed':
      return `it does not read under the entity's ESchema: ${reason.cause.message}`;
    default:
      return reason._tag;
  }
};

/** Runs `each` on every row of the table, page by page, strongly consistent. */
const eachRow = <E, R>(
  options: {
    readonly table: StdTable;
    readonly store: StdTableContract;
    readonly pageSize: number;
  },
  each: (item: StoredItem) => Effect.Effect<void, E, R>,
) =>
  Effect.gen(function* () {
    const { store } = options;
    let after: StoredItem | undefined;
    for (;;) {
      const page = yield* store
        .scanItems({
          limit: options.pageSize,
          consistent: true,
          ...(after === undefined
            ? {}
            : { startAfter: { pk: after.pk, sk: after.sk } }),
        })
        .pipe(Effect.mapError(failed));
      for (const item of page.items) yield* each(item);
      after = page.items.at(-1);
      if (!page.hasMore || after === undefined) return;
    }
  }).pipe(
    Effect.provide(contractLayer(options.table.logicalName, options.store)),
  );
