# @kestack/std-toolkit

Single-table design toolkit: database-agnostic sync over single-table item collections, with schema evolution, portable database adapters, and TanStack DB integration

## Big picture

Applications that store many entity types in one table, then mirror that data into a browser, end up writing the same three things by hand: a schema that can still read last year's rows, a storage layer that is bolted to one database, and a sync loop that keeps a client cache fresh. std-toolkit provides each as a separate subpath that shares one Entity model, so they compose without glue code.

`core` defines the Entity envelope and metadata every other subpath speaks. `eschema` gives versioned schemas that migrate on read. `db` declares a StdTable once, with its keys, indexes and entities, and the DynamoDB, SQLite, IndexedDB, and Memory adapters realize it without changing application code. `sync` drives TanStack DB Collections from any backend and persists its replica through the same StdTable contract; `replica` does the same for Kabuki apps, as actors. `snapshot` captures the resulting storage contract as one document per table. Every physical table declares a mode: `persistent` data must survive every schema change, `disposable` data may be thrown away when a change is not safe. Each adapter's setup compares the table with the Stored contract kept as reserved rows inside it, then refuses a persistent table's breaking change or wipes a disposable one, and reindexes the rows an index change touches before the new code serves. A change no migration can make goes to a new table, through a table migration, `StdTable.migrate`, that moves every row once. `alchemy` deploys D1 and DynamoDB tables and runs their setup at deploy; for a table set up later on a device or object, its deploy guard refuses at deploy what setup would refuse, keeping the Deployed contract in Alchemy state. `@kestack/std-toolkit/db/testing` is the one test a persistent table needs: it fails unless the table's snapshot has no breaking change against the committed file, and every stored version of every entity upgrades. Snapshot never runs at request time.

Each subpath owns its vocabulary in a `CONTEXT.md`: [core](src/core/CONTEXT.md), [eschema](src/eschema/CONTEXT.md), [snapshot](src/snapshot/CONTEXT.md), [db](src/db/CONTEXT.md), [sync](src/sync/CONTEXT.md), [replica](src/replica/CONTEXT.md). The [context map](CONTEXT-MAP.md) explains how they relate. Decisions live in [docs/adr/](docs/adr/), [src/db/docs/adr/](src/db/docs/adr/), and [src/sync/docs/adr/](src/sync/docs/adr/). Longer reads: [Evolving schema](docs/evolving-schema.md), [Sync guide](docs/sync-guide.md). The [stories](stories/) folder tells this package as a tree of Stories, each folder a `story.md` with runnable Proofs beside it: `evolving-schema` (with `migrations` and `snapshot`), `entities` (`keyed` and `single`), `adapters` (with `transactions`), and `sync`. Run them with `pnpm stories`.

## Install

```sh
pnpm add @kestack/std-toolkit effect
```

Node 24 or later. Peer dependencies:

- `effect` (required): every subpath is built on Effect Services, Layers, and Schema.
- `@tanstack/react-db` (optional): `@kestack/std-toolkit/sync` creates and drives TanStack DB Collections.
- `react` (optional): required by `@tanstack/react-db`; only needed when you use `@kestack/std-toolkit/sync`.
- `@kestack/kabuki` (optional): `@kestack/std-toolkit/replica` runs as Kabuki actors and Commands.
- `@tanstack/db` (optional): `@kestack/std-toolkit/replica` shows each Instance in TanStack DB Collections, without React.
- `alchemy`, `@alchemy.run/cloudflare` and `@alchemy.run/aws` (optional): only `@kestack/std-toolkit/alchemy` imports them, to deploy a table (D1 on Cloudflare, DynamoDB on AWS) and guard its contract.

## Exports

### `@kestack/std-toolkit/core`

See [src/core/README.md](src/core/README.md).

### `@kestack/std-toolkit/eschema`

See [src/eschema/README.md](src/eschema/README.md).

### `@kestack/std-toolkit/eschema/testing`

See [src/eschema/README.md](src/eschema/README.md#kestackstd-toolkiteschematesting).

### `@kestack/std-toolkit/snapshot`

| Export                        | What it does                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `TableSnapshot.capture`       | Captures a table's contract as plain data: topology, entities, and every schema version. |
| `TableSnapshot.parse`         | Reads a stored document, migrating older formats forward and validating its references.  |
| `TableSnapshot.diff`          | Compares a previous and a current snapshot into classified semantic changes.             |
| `TableSnapshot.renderChanges` | Renders a list of changes as human-readable text, grouped by impact.                     |
| `TableSnapshot.changeLabel`   | Names one change in a line, such as `Task v1 edited`.                                    |
| `TableSnapshotESchema`        | The ESchema of the stored table snapshot document.                                       |
| `SnapshotIncompatible`        | Error raised when a new snapshot is not upgradable from the accepted one.                |

### `@kestack/std-toolkit/snapshot/vitest`

The file check `expectTableShippable` is built on. It needs `vitest` as a peer.

| Export               | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `expectSnapshotFile` | Fails on a breaking change against the committed snapshot file, or when the file is out of date. |

### `@kestack/std-toolkit/alchemy`

Deploys a StdTable with Alchemy. Each table resource takes a required `mode` and runs the table's setup at deploy, before the Worker goes live, so a refusal or a failed reindex fails the deploy. A table whose setup runs later, on a device or an object, gets a deploy guard instead: it keeps the Deployed contract in Alchemy state and fails the deploy on a change setup would refuse. Add `providers()` to the stack's providers, over Cloudflare's, which its D1 table runs on.

| Export               | What it does                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `DynamoDB.table`     | Creates the DynamoDB table and runs its setup at deploy; adds a new global secondary index in place and refuses other index changes. |
| `D1.table`           | Runs SQLite setup in D1 at deploy against the Stored contract kept in the table, reindex included.                                   |
| `D1.migration`       | Runs a table migration from one D1 table into a new one at deploy, after both are set up and before the Worker that binds it.        |
| `DynamoDB.migration` | Runs a table migration from one DynamoDB table into a new one at deploy, the same way.                                               |
| `DeployGuard.table`  | Refuses at deploy what setup would refuse later, for an IndexedDB or Durable Object table; one guard covers all its tables.          |
| `providers`          | Every provider std-toolkit's resources need, to merge into a stack's `providers`.                                                    |

### `@kestack/std-toolkit/db`

| Export                  | What it does                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `StdTable.make`         | Starts a table declaration from a logical name; chain `primary`, `lsi`, `gsi`, `entity`, `singleEntity`, then `build`.   |
| `StdTable.migrate`      | Moves every row of an old table into a new one once, through one handler per old entity, as a stream of progress events. |
| `StdTable.runMigration` | Runs a table migration to its end, logging each event, and returns `Done` or `Skipped`.                                  |
| `MigrationRefused`      | Tagged error a table migration fails with before it changes anything, such as a new table already in use.                |
| `MigrationRowFailed`    | Tagged error a table migration fails with when one old row does not decode or its handler fails.                         |
| `DatabaseError`         | Tagged error every StdTable operation fails with, carrying a `reason` such as a failed condition.                        |

The built `StdTable` carries each declared entity under its ESchema name (`table.Task`) and exposes `transact`, `scan`, `subscribe`, `drift`, `reindex`, and `dangerouslyRemoveAllItems`. See [src/db/CONTEXT.md](src/db/CONTEXT.md).

### `@kestack/std-toolkit/db/testing`

The one test a persistent table needs; a StdTable kept only in disposable tables needs none. It needs `vitest` as a peer.

```ts
import { expectTableShippable } from '@kestack/std-toolkit/db/testing';
import { it } from 'vitest';
import { table } from '../src/table.js';

it('keeps the table safe to ship', async () => {
  await expectTableShippable(table, './fixtures/table.snapshot.json');
});
```

The file holds the table snapshot: topology, entities, every version of every schema the table reaches, compared as parsed data so formatting never fails the test. The test fails, listing every reason, when a stored version of any schema the table reaches does not upgrade or a migration changes a row's id or partition key, when the snapshot has a breaking change against the file, or when the file is out of date. `vitest -u` writes the file only for changes that are safe or need a reindex, which setup runs itself. Nothing accepts a breaking change or a failing upgrade: undo the edit and add a new version with a migration, or move the data to a new table with a table migration. A committed file that cannot be read fails too, even under `-u`, since it is the baseline breaking changes are judged against. The test cannot be enforced, so it is the earliest check, not the only one: setup against the Stored contract, and the deploy guard, refuse a breaking change too, so a hand-edited or deleted file cannot ship one.

| Export                 | What it does                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `expectTableShippable` | Fails unless every stored version upgrades and the snapshot has no breaking change. |

### `@kestack/std-toolkit/db/dynamodb`

See [src/db/dynamodb/README.md](src/db/dynamodb/README.md).

### `@kestack/std-toolkit/db/idb`

See [src/db/idb/README.md](src/db/idb/README.md).

### `@kestack/std-toolkit/db/memory`

See [src/db/memory/README.md](src/db/memory/README.md).

### `@kestack/std-toolkit/db/sqlite`

See [src/db/sqlite/README.md](src/db/sqlite/README.md). It also covers the driver entrypoints `./db/sqlite/node`, `./db/sqlite/bun`, `./db/sqlite/better-sqlite3`, `./db/sqlite/d1`, and `./db/sqlite/durable-object`.

### `@kestack/std-toolkit/sync`

See [src/sync/README.md](src/sync/README.md). It also covers `./sync/paced` and the Sync adapters `./sync/idb` and `./sync/memory`.

### `@kestack/std-toolkit/replica`

See [src/replica/README.md](src/replica/README.md). It also covers the Stores `./replica/idb` and `./replica/memory`.

## Usage

### Define a schema, store it in a table, sync it to the browser

The same `Task` schema serves storage and sync. The table is realized in memory here; swapping `Memory.make(table)` for a SQLite, IndexedDB, or DynamoDB adapter changes nothing else. The sync instance polls the table for changes and projects them into a TanStack DB Collection.

```ts
import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { createStdSync, strategy } from '@kestack/std-toolkit/sync';

// 1. The shape of a task; `taskId` identifies one.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
}).build();

// 2. A table, and Task declared on it: `boardId` fills the partition key.
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const board = Memory.make(table);

// 3. The server side of sync: tasks on one board changed after `cursor`.
const changesOn = (boardId: string, cursor: { meta: { _u: string } } | null) =>
  table.Task.query('primary', { pk: { boardId }, '>=': null }).pipe(
    Effect.map((page) =>
      page.items
        .filter((item) => cursor === null || item.meta._u > cursor.meta._u)
        .sort((a, b) => (a.meta._u < b.meta._u ? -1 : 1)),
    ),
    Effect.provide(board.layer),
  );

// 4. A sync instance and a Collection that reads one board at a time.
const app = createStdSync({ name: 'board' });
const tasks = app.collection(Task, {
  sync: {
    windows: {
      boardId: (boardId) =>
        strategy.oldToNew({
          fetch: ({ after }) => changesOn(boardId, after),
          pollEvery: '1 second',
        }),
    },
  },
  onInsert: (items) =>
    Effect.forEach(items, (item) => table.Task.insert(item)).pipe(
      Effect.provide(board.layer),
    ),
});

// 5. A live query for the `work` board starts the sync for that window.
const screen = createLiveQueryCollection({
  query: (q) =>
    q.from({ task: tasks }).where(({ task }) => eq(task.boardId, 'work')),
  startSync: true,
});
```

- `EntityESchema.make(...).build()` produces a schema that encodes with a `_v` stamp and decodes any past version to the latest shape.
- `.entity(Task, (e) => e.primary({ pk: ['boardId'] }))` maps key paths of the value to the table's key attributes; the sort key is always the id field. The built table carries it as `table.Task`; a table is one declaration, so every entity is declared on it before `build`. A key path may reach into nested objects and union branches (`owner.teamId`) and must end at a string or number.
- `Memory.make(table).layer` satisfies the `StdTableService<'board'>` requirement of every `table.Task.*` call. Any other adapter's layer does the same.
- `createStdSync` keeps its local copy in memory by default. In a real page pass `store: Sync.idb()` from `@kestack/std-toolkit/sync/idb` to keep it in IndexedDB and let one tab read for all.
- A window's strategy starts when a TanStack query filters on `boardId`. `after` is exclusive: return entities strictly after it.
- `onInsert` writes through to the same table, so the next poll confirms the optimistic row.

### Deploy a table and refuse a breaking change

An application deploys its table through `@kestack/std-toolkit/alchemy`. For a persistent table, every deploy compares the new snapshot with the Stored contract kept in the table, and fails before the table is touched if a stored version was edited or removed, or the key layout moved; otherwise it reindexes the rows an index change touches before the Worker goes live. Lifted from the former `apps/alchemy-console/alchemy.run.ts` (tag `alchemy-console-old`).

```ts
import { Stack, Stage } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import {
  D1,
  providers as stdToolkitProviders,
} from '@kestack/std-toolkit/alchemy';
import { consoleTable } from './src/server/storage/table/index.ts';

export const Database = Cloudflare.D1.Database(
  'Database',
  Effect.gen(function* () {
    return { name: `alchemy-console-${yield* Stage}` };
  }),
);

export const Worker = Cloudflare.Website.Vite(
  'Worker',
  Effect.gen(function* () {
    const database = yield* Database;
    const table = yield* D1.table('ConsoleTable', {
      table: consoleTable,
      database,
      mode: 'persistent',
    });
    // Binding the table's name makes the Worker wait for its setup.
    return { env: { DB: Database, DB_TABLE: table.tableName } };
  }),
);

export default Stack(
  'AlchemyConsole',
  {
    // The D1 table runs on Cloudflare's providers, so they are given to it.
    providers: stdToolkitProviders().pipe(
      Layer.provideMerge(Cloudflare.providers()),
    ),
    state: Cloudflare.state(),
  },
  Worker,
);
```

- `D1.table` registers a table resource whose provider runs SQLite setup in D1 at deploy. Setup checks the Stored contract kept in the table, which is the baseline, before creating the table, reconciling indexes and reindexing rows.
- The Worker binds `table.tableName`, so it depends on the table resource and goes live only after setup and its reindex. A Worker that binds only `DB` may deploy in parallel with them.
- A disposable D1 table is wiped at deploy on a change its rows cannot take, an index change included. A persistent table never becomes disposable.
- `DynamoDB.table` works the same way on AWS: its resource creates a missing table and runs DynamoDB setup against the Stored contract inside it. It takes the `region`, and `credentials` or the `AWS_*` variables. The Worker binds its `tableName` the same way, and needs it anyway: a DynamoDB table name never defaults.
- At runtime the application provides an adapter layer, `SQLite.make(table, { database: makeD1SQLite({ database: env.DB }), tableName: env.DB_TABLE }).layer`, and runs no setup.
- An IndexedDB or Durable Object table is set up when it opens; `DeployGuard.table(table)` in the stack refuses at deploy what that setup would refuse.
- A new table that a table migration fills gets `D1.migration(id, { from, to, migrate: StdTable.migrate(oldTable, table, handlers) })`, with both `D1.table` resources. The Worker binds the migration's `tableName`, so it goes live only after every row is through; once done, later deploys skip it.

### Add an index to a table that already holds rows

A release finds tasks by status. Old tasks were stored without keys for the new index, so on a persistent table setup scans the table and rewrites each task whose index keys are missing, before it records the new contract. Nothing is declared for it. Here it runs on SQLite at process start. Lifted from [stories/evolving-schema/migrations](stories/evolving-schema/migrations/setup-reindexes-old-rows-into-a-new-index.proof.ts).

```ts
import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
}).build();

// The last release had no byStatus pattern; this one adds it on GSI1.
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(Task, (e) =>
    e
      .primary({ pk: ['boardId'] })
      .index('GSI1', 'byStatus', { pk: ['status'], sk: ['title'] }),
  )
  .build();

const database = makeNodeSQLite({ path: 'board.db' });
const outcome = await Effect.runPromise(
  SQLite.setup(table, { mode: 'persistent', database }),
);
// { kind: 'applied', reindexed: ['Task'], changes: [...] }
```

- Setup reindexes an entity when an index or access pattern it uses is added or edited, and when a schema it reaches gains a version, since a migration may change an indexed field. It rewrites only rows whose index keys drifted, with `drift` and `reindex`.
- It keeps no progress. The Stored contract is recorded only after the scan, so a setup that stops part-way leaves the old contract, and the next one reindexes again. A row an app write moves meanwhile is read again and retried, up to three times.
- DynamoDB adds a new global secondary index and waits for it before the scan; IndexedDB changes its indexes in a version upgrade first. A disposable table is wiped instead.
- A change no migration can make, such as a value no old row holds, is refused as breaking on a persistent table. The way past is a new physical table and a table migration into it, `StdTable.migrate`: see [stories/evolving-schema](stories/evolving-schema/a-table-migrates-into-a-new-table.proof.ts).
