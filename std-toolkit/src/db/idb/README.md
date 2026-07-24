# std-toolkit/idb

In-browser IndexedDB table and entity services built on Effect — the browser sibling of `std-toolkit/sqlite`, implementing the same single-table topology over one IndexedDB object store per table.

See `src/db/idb/CONTEXT.md` for the adapter's vocabulary (where it diverges from the shared `src/db/CONTEXT.md` kernel), `src/db/docs/adr/0001-buffered-transact-ops-only.md` for why `transact()` works the way it does, and `src/db/idb/docs/adr/0001-auto-versioned-setup.md` for `setup()`.

## Quickstart

```ts
import { Effect, Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';
import { IdbTable, idbLayer } from 'std-toolkit/idb';

const UserSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  name: Schema.String,
}).build();

const table = IdbTable.make()
  .primary('pk', 'sk')
  .index('IDX1', 'IDX1PK', 'IDX1SK')
  .build();

const userEntity = table.entity(UserSchema).primary().build();

const program = Effect.gen(function* () {
  yield* table.setup();

  yield* userEntity.insert({
    userId: 'user-1',
    email: 'ada@example.com',
    name: 'Ada',
  });

  const { items } = yield* userEntity.query('primary', {
    sk: { '>=': null },
  });

  return items;
});

Effect.runPromise(
  program.pipe(Effect.provide(idbLayer('my-app-db', 'std_data'))),
);
```

`idbLayer(dbName, tableName)` provides `IdbDB` for one object store (`tableName`) inside one IndexedDB database (`dbName`). Auto-versioned setup: the adapter owns `dbName`'s version number — `table.setup()` diffs declared stores/indexes against what exists and only bumps the version when something is missing, so a database name handed to `idbLayer` belongs exclusively to this adapter (see the ADR).

## Key exports

**Services**

- `IdbTable` — the single-table topology; entities are defined from it via `table.entity(eschema)` / `table.singleEntity(eschema)` and it coordinates `setup()` and `transact()`
- `table.snapshot()` — synchronously captures the logical topology, registered entities, ESchema histories, and sparse index derivations without opening IndexedDB. See the [shared snapshot workflow](../../eschema/README.md#semantic-contract-snapshots).

**Database**

- `IdbDB` — database abstraction layer
- `IdbDBError` — error type for database failures
- `idbLayer` — constructs the `IdbDB` layer for a given database/table name pair

**Types**

- `IdbTableInstance`, `IdbEntityOp`, `EntityType` (re-exported from `std-toolkit/core`)

## Entity layer notes

- `hardDelete` is single-key: unlike SQLite's bulk `hardDelete` (a plain SQL `WHERE`), IndexedDB has no primitive to scan every partition key an entity's rows might live under, so hard delete removes one key at a time. Prefer the soft `delete` (tombstone via `_d`) for anything a sync consumer reads.
- `table.transact(ops)` takes `IdbEntityOp` descriptors produced by `entity.insertOp(...)` / `entity.getAndUpdateOp(...)` / `entity.deleteOp(...)` / `entity.restoreOp(...)` / `singleEntity.getAndUpdateOp(...)` — which validate, migrate, and derive keys up front, outside any transaction — and applies them all in one native IndexedDB read-write transaction with no foreign awaits inside it. Ops from an entity of a different table are rejected at runtime. Broadcasts fire only after that transaction commits, in op order. See the buffered-transactions ADR for why there is no interactive `begin`/`commit` like `SqliteDB`'s.
