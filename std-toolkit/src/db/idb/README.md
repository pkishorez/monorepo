# std-toolkit/idb

In-browser IndexedDB table and entity services built on Effect — the browser sibling of `std-toolkit/sqlite`, implementing the same single-table topology over one IndexedDB object store per table.

See `src/db/idb/CONTEXT.md` for the adapter's vocabulary (where it diverges from the shared `src/db/CONTEXT.md` kernel) and `src/db/idb/docs/adr/0001-buffered-transactions-and-auto-versioning.md` for why `transact()` and `setup()` work the way they do.

## Quickstart

```ts
import { Effect, Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';
import { IdbTable, IdbEntity, EntityRegistry, idbLayer } from 'std-toolkit/idb';

const UserSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  name: Schema.String,
}).build();

const table = IdbTable.make()
  .primary('pk', 'sk')
  .index('IDX1', 'IDX1PK', 'IDX1SK')
  .build();

const userEntity = IdbEntity.make(table).eschema(UserSchema).primary().build();

const registry = EntityRegistry.make(table).register(userEntity).build();

const program = Effect.gen(function* () {
  yield* registry.setup();

  yield* registry.entity('User').insert({
    userId: 'user-1',
    email: 'ada@example.com',
    name: 'Ada',
  });

  const { items } = yield* registry
    .entity('User')
    .query('primary', { sk: { '>=': null } });

  return items;
});

Effect.runPromise(
  program.pipe(Effect.provide(idbLayer('my-app-db', 'std_data'))),
);
```

`idbLayer(dbName, tableName)` provides `IdbDB` for one object store (`tableName`) inside one IndexedDB database (`dbName`). Auto-versioned setup: the adapter owns `dbName`'s version number — `registry.setup()` (or `table.setup()`) diffs declared stores/indexes against what exists and only bumps the version when something is missing, so a database name handed to `idbLayer` belongs exclusively to this adapter (see the ADR).

## Key exports

**Services**

- `IdbTable`, `IdbEntity`, `IdbSingleEntity` — Effect services for table and entity operations
- `EntityRegistry` — registry of all entities sharing one table

**Database**

- `IdbDB` — database abstraction layer
- `IdbDBError` — error type for database failures
- `idbLayer` — constructs the `IdbDB` layer for a given database/table name pair

**Types**

- `IdbTableInstance`, `IdbEntityOp`, `EntityType` (re-exported from `std-toolkit/core`)

## Entity layer notes

- `IdbEntity.hardDelete` is single-key: unlike SQLite's bulk `hardDelete` (a plain SQL `WHERE`), IndexedDB has no primitive to scan every partition key an entity's rows might live under, so hard delete removes one key at a time. Prefer the soft `delete` (tombstone via `_d`) for anything a sync consumer reads.
- `EntityRegistry.transact(ops)` takes `IdbEntityOp` descriptors produced by `entity.insertOp(...)` / `entity.updateOp(...)` — which validate, migrate, and derive keys up front, outside any transaction — and applies them all in one native IndexedDB read-write transaction with no foreign awaits inside it. Broadcasts fire only after that transaction commits, in op order. See the buffered-transactions ADR for why there is no interactive `begin`/`commit` like `SqliteDB`'s.
