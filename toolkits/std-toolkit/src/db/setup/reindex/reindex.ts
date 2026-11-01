import { Effect } from 'effect';
import {
  contractLayer,
  OperationFailure,
  type StdTableContract,
  type StoredItem,
} from '../../std-table/contract/index.js';
import type { DatabaseError } from '../../std-table/error/index.js';
import type { StdTable } from '../../std-table/table/index.js';

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
  Effect.gen(function* () {
    const { table, store } = options;
    const wanted = new Set(options.entities);
    if (wanted.size === 0) return;
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
      for (const item of page.items)
        if (wanted.has(item.meta._e)) yield* reindexRow(table, store, item);
      after = page.items.at(-1);
      if (!page.hasMore || after === undefined) return;
    }
  }).pipe(
    Effect.provide(contractLayer(options.table.logicalName, options.store)),
  );
