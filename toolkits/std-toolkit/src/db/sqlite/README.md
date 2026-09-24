# std-toolkit/db/sqlite

SQLite adapter that realizes a StdTable over a driver for Node, Bun, better-sqlite3, Cloudflare D1, or Durable Objects.

## Big picture

One adapter, several runtimes. `SQLite.make` takes a `SQLiteDriver` and produces a layer plus an explicit `setup` that creates the physical table, runs table-level enforcement against the baseline stored inside it, and only then adds missing index columns and indexes; providing the layer never changes the schema. Each driver entrypoint is a separate subpath so its platform dependency is only loaded where it is used. Divergences from the DynamoDB topology, read-consistency, and transaction rules are in [CONTEXT.md](CONTEXT.md); shared vocabulary is in [db/CONTEXT.md](../CONTEXT.md).

## Install

See the [top README](../../../README.md). Install the driver's own dependency where needed (`better-sqlite3` for that driver; Node's `node:sqlite` and Bun's `bun:sqlite` are built in).

## Exports

### `std-toolkit/db/sqlite`

| Export        | What it does                                                                |
| ------------- | --------------------------------------------------------------------------- |
| `SQLite.make` | Realizes a StdTable on a driver; returns `tableName`, `layer`, and `setup`. |

### `std-toolkit/db/sqlite/node`

| Export           | What it does                                                                 |
| ---------------- | ---------------------------------------------------------------------------- |
| `makeNodeSQLite` | Driver over `node:sqlite`; opens `path` or wraps an existing `DatabaseSync`. |

### `std-toolkit/db/sqlite/bun`

| Export          | What it does                                    |
| --------------- | ----------------------------------------------- |
| `makeBunSQLite` | Driver over a `bun:sqlite` `Database` instance. |

### `std-toolkit/db/sqlite/better-sqlite3`

| Export              | What it does                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| `makeBetterSQLite3` | Driver over `better-sqlite3`; opens `path` or wraps an existing database. |

### `std-toolkit/db/sqlite/d1`

| Export         | What it does                                                                      |
| -------------- | --------------------------------------------------------------------------------- |
| `makeD1SQLite` | Driver over a Cloudflare Worker's D1 binding; guarded writes run as one D1 batch. |

### `std-toolkit/db/sqlite/durable-object`

| Export                    | What it does                                      |
| ------------------------- | ------------------------------------------------- |
| `makeDurableObjectSQLite` | Driver over a Durable Object's `storage.sql` API. |

## Usage

### Run a program on SQLite in Node

Lifted from story 24.

```ts
import { Effect } from 'effect';
import { StdTable } from 'std-toolkit/db';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';

const table = StdTable.make('board').primary('pk', 'sk').build();

const database = makeNodeSQLite({ path: ':memory:' });
const sqlite = SQLite.make(table, { database });

const program = Effect.gen(function* () {
  yield* sqlite.setup;
  return yield* saveAndRead.pipe(
    Effect.provide(sqlite.layer),
    Effect.ensuring(Effect.sync(() => database.close?.())),
  );
});
```

- One driver can serve several StdTables; `tableName` defaults to the logical name.
- Drivers that open a file themselves expose `close`; drivers wrapping a caller-owned database do not close it.

### Run on Cloudflare D1

```ts
import { Effect } from 'effect';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeD1SQLite } from 'std-toolkit/db/sqlite/d1';

// Inside the Worker, where env.DB is a D1 database binding.
const database = makeD1SQLite({ database: env.DB });
const peopleD1 = SQLite.make(people, { database });

await Effect.runPromise(peopleD1.setup);
await Effect.runPromise(program.pipe(Effect.provide(peopleD1.layer)));
```

- Use the binding directly so reads target the primary and honor the adapter's read-consistency contract.
- Each guarded statement adds a SQL assertion inside the D1 batch, so a failed condition rolls back the batch before commit.
- Blob values return as `Uint8Array`; native `bigint` parameters are rejected because D1 does not support them.
- The D1 conformance tests run on Miniflare: `pnpm exec vitest run src/db/sqlite/__tests__/d1.test.ts`. They start a local server and need no Cloudflare credentials.
