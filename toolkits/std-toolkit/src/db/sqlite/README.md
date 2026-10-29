# @kestack/std-toolkit/db/sqlite

SQLite adapter that realizes a StdTable over a driver for Node, Bun, better-sqlite3, Cloudflare D1, or Durable Objects.

## Big picture

One adapter, several runtimes. `SQLite.make` takes a `SQLiteDriver` and returns the layer; it never changes the schema. `SQLite.setup` prepares the physical table under a required `mode`, through the setup every adapter shares ([ADR 0021](../../../docs/adr/0021-the-stored-contract-is-rows-inside-the-table.md)). It creates the table if missing, then compares the table's contract with the Stored contract kept as reserved rows inside the table. A `persistent` table refuses a breaking change with `SetupRefused`, and is never wiped. A `disposable` table has every row deleted on any change its rows cannot take, an index change included. A persistent table never becomes disposable. Then setup creates or drops the SQL indexes the new snapshot needs, reindexes the rows an index change touches, and records the new contract. Run it where no request pays for it: on D1, `D1.table` in [`@kestack/std-toolkit/alchemy`](../../../README.md#std-toolkitalchemy) calls it at deploy; on Node or Bun, at process start; in a Durable Object, on the object's first access. Each driver entrypoint is a separate subpath so its platform dependency is only loaded where it is used. Divergences from the DynamoDB topology, read-consistency, and transaction rules are in [CONTEXT.md](CONTEXT.md); shared vocabulary is in [db/CONTEXT.md](../CONTEXT.md).

## Install

See the [top README](../../../README.md). Install the driver's own dependency where needed (`better-sqlite3` for that driver; Node's `node:sqlite` and Bun's `bun:sqlite` are built in).

## Exports

### `@kestack/std-toolkit/db/sqlite`

| Export         | What it does                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `SQLite.make`  | Realizes a StdTable on a driver; returns `tableName` and `layer`.                                              |
| `SQLite.setup` | Checks the Stored contract under the table's `mode`, then creates or updates the table and reindexes its rows. |
| `SetupRefused` | Error raised when setup refuses a table: a breaking change, a mode change, or rows with no contract.           |

### `@kestack/std-toolkit/db/sqlite/node`

| Export           | What it does                                                                 |
| ---------------- | ---------------------------------------------------------------------------- |
| `makeNodeSQLite` | Driver over `node:sqlite`; opens `path` or wraps an existing `DatabaseSync`. |

### `@kestack/std-toolkit/db/sqlite/bun`

| Export          | What it does                                    |
| --------------- | ----------------------------------------------- |
| `makeBunSQLite` | Driver over a `bun:sqlite` `Database` instance. |

### `@kestack/std-toolkit/db/sqlite/better-sqlite3`

| Export              | What it does                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| `makeBetterSQLite3` | Driver over `better-sqlite3`; opens `path` or wraps an existing database. |

### `@kestack/std-toolkit/db/sqlite/d1`

| Export         | What it does                                                                      |
| -------------- | --------------------------------------------------------------------------------- |
| `makeD1SQLite` | Driver over a Cloudflare Worker's D1 binding; guarded writes run as one D1 batch. |

### `@kestack/std-toolkit/db/sqlite/durable-object`

| Export                    | What it does                                      |
| ------------------------- | ------------------------------------------------- |
| `makeDurableObjectSQLite` | Driver over a Durable Object's `storage.sql` API. |

## Usage

### Run a program on SQLite in Node

The same program on Memory and SQLite is compared in [the-same-program-runs-on-sqlite.story.ts](../../../stories/std-table/the-same-program-runs-on-sqlite.story.ts).

```ts
import { Effect } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';

const table = StdTable.make('board').primary('pk', 'sk').build();

const database = makeNodeSQLite({ path: ':memory:' });
const sqlite = SQLite.make(table, { database });

const program = Effect.gen(function* () {
  yield* SQLite.setup(table, { database, mode: 'persistent' });
  return yield* saveAndRead.pipe(
    Effect.provide(sqlite.layer),
    Effect.ensuring(Effect.sync(() => database.close?.())),
  );
});
```

- One driver can serve several StdTables; `tableName` defaults to the logical name.
- An unchanged table is one read of its contract's table row.
- An old `_std_contract` table from before ADR 0021 is ignored; a table holding rows but no contract is refused if persistent and wiped if disposable.
- Drivers that open a file themselves expose `close`; drivers wrapping a caller-owned database do not close it.

### Run on Cloudflare D1

```ts
import { Effect } from 'effect';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeD1SQLite } from '@kestack/std-toolkit/db/sqlite/d1';

// Inside the Worker, where env.DB is a D1 database binding.
const database = makeD1SQLite({ database: env.DB });
const peopleD1 = SQLite.make(people, { database });

// The table already exists: `D1.table` from @kestack/std-toolkit/alchemy set it up at deploy,
// so the Worker never runs setup.
await Effect.runPromise(program.pipe(Effect.provide(peopleD1.layer)));
```

- Use the binding directly so reads target the primary and honor the adapter's read-consistency contract.
- Each guarded statement adds a SQL assertion inside the D1 batch, so a failed condition rolls back the batch before commit.
- Blob values return as `Uint8Array`; native `bigint` parameters are rejected because D1 does not support them.
- The D1 conformance tests run on Miniflare: `pnpm exec vitest run src/db/sqlite/__tests__/d1.test.ts`. They start a local server and need no Cloudflare credentials.
