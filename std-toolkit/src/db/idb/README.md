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

const table = IdbTable.make('std_data')
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

Effect.runPromise(program.pipe(Effect.provide(idbLayer('my-app-db'))));
```

`idbLayer(dbName)` provides one database-scoped runtime. Each `IdbTable.make(storeName)` owns its real IndexedDB object-store name. Multiple tables can share the same layer. Auto-versioned `table.setup()` creates that store and its missing indexes, bumping the database version only when needed.

## Key exports

**Services**

- `IdbTable` — the single-table topology; entities are defined from it via `table.entity(eschema)` / `table.singleEntity(eschema)` and it coordinates `setup()` and `transact()`
- `table.snapshot()` — synchronously captures the storage topology, registered entities, ESchema histories, and sparse index derivations without opening IndexedDB. See the [shared snapshot workflow](../../eschema/README.md#semantic-contract-snapshots).

**Database**

- `IdbError` — IndexedDB operation failures plus shared persistence failures
- `idbLayer` — constructs the runtime for one IndexedDB database

**Types**

- `IdbTableInstance`, `EntityType`, `SingleEntityType`

## Entity layer notes

- `hardDelete(key, 'I KNOW WHAT I AM DOING')` physically removes one record. `dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING')` removes every record at table or entity scope. Prefer the soft `delete` tombstone for anything a sync consumer reads.
- `table.transact(ops)` applies descriptors from the entity `*Op` methods in one native read-write transaction. Foreign-table and duplicate-target ops fail with shared typed persistence errors. Broadcasts fire only after commit, in order.
