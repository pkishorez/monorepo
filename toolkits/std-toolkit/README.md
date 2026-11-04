# @kestack/std-toolkit

Single-table design toolkit: entities in one table on any database, with schema evolution, safe deploys, and sync for React and Kabuki apps

## Big picture

Applications that store many entity types in one table, then mirror that data into a browser, end up writing the same three things by hand: a schema that can still read last year's rows, a storage layer that is bolted to one database, and a sync loop that keeps a client cache fresh. std-toolkit provides each as a separate subpath that shares one Entity model, so they compose without glue code.

The package reads as five parts. `schema` says what a row is: the Entity envelope every part speaks, versioned schemas (ESchemas) that read old rows in today's shape, and `schema/snapshot`, which captures a table's storage contract as one document. `db` says where rows live: `StdTable.make` declares a table once, with its keys, indexes and entities, and the DynamoDB, SQLite, IndexedDB and Memory adapters realize it without changing application code. `sync` and `replica` get rows to the app: a local copy of the backend on the device, in TanStack DB Collections. `sync` drives them from React; `replica` runs them as Kabuki actors. The two share no code. `deploy` ships tables with Alchemy. Each part uses only the parts before it.

Every physical table declares a mode: `persistent` data must survive every schema change, `disposable` data may be thrown away when a change is not safe. Each adapter's setup compares the table with the Stored contract kept as reserved rows inside it, then refuses a persistent table's breaking change or wipes a disposable one, and reindexes the rows an index change touches before the new code serves. A change no migration can make goes to a new table, through a table migration, `StdTable.migrate`, that moves every row once. `deploy` creates D1 and DynamoDB tables and runs their setup at deploy; for a table set up later on a device or object, its deploy guard refuses at deploy what setup would refuse, keeping the Deployed contract in Alchemy state. `@kestack/std-toolkit/db/testing` is the one test a persistent table needs: it fails unless the table's snapshot has no breaking change against the committed file, and every stored version of every entity upgrades. Snapshot never runs at request time.

Each part owns its vocabulary in a `CONTEXT.md`: [entity](src/schema/entity/CONTEXT.md), [eschema](src/schema/eschema/CONTEXT.md), [snapshot](src/schema/snapshot/CONTEXT.md), [db](src/db/CONTEXT.md), [sync](src/sync/CONTEXT.md), [replica](src/replica/CONTEXT.md). The [context map](CONTEXT-MAP.md) explains how they relate. Decisions live in [docs/adr/](docs/adr/). Longer reads: [Evolving schema](docs/evolving-schema.md), [Sync guide](docs/sync-guide.md). The [stories](stories/) folder tells this package as a tree of Stories, each folder a `story.md` with runnable Proofs beside it: `evolving-schema` (with `migrations` and `snapshot`), `entities` (`keyed` and `single`), `adapters` (with `transactions`), and `sync`. Run them with `pnpm stories`.

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
- `alchemy`, `@alchemy.run/cloudflare` and `@alchemy.run/aws` (optional): only `@kestack/std-toolkit/deploy` imports them, to deploy a table (D1 on Cloudflare, DynamoDB on AWS) and guard its contract.

## Exports

### `@kestack/std-toolkit/schema`

See [src/schema/README.md](src/schema/README.md).

### `@kestack/std-toolkit/schema/snapshot`

See [src/schema/README.md](src/schema/README.md#kestackstd-toolkitschemasnapshot).

### `@kestack/std-toolkit/schema/testing`

See [src/schema/README.md](src/schema/README.md#kestackstd-toolkitschematesting).

### `@kestack/std-toolkit/deploy`

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
| `Broadcaster`           | Effect Service that receives each table's confirmed writes as Change Notices and exposes them as a Stream.               |
| `defaultBroadcaster`    | In-process PubSub-backed Layer for `Broadcaster`.                                                                        |
| `sharedBroadcaster`     | Layer for `Broadcaster` shared by every tab of this origin under one name.                                               |

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

See [src/db/adapters/dynamodb/README.md](src/db/adapters/dynamodb/README.md).

### `@kestack/std-toolkit/db/idb`

See [src/db/adapters/idb/README.md](src/db/adapters/idb/README.md).

### `@kestack/std-toolkit/db/memory`

See [src/db/adapters/memory/README.md](src/db/adapters/memory/README.md).

### `@kestack/std-toolkit/db/sqlite`

See [src/db/adapters/sqlite/README.md](src/db/adapters/sqlite/README.md). It also covers the driver entrypoints `./db/sqlite/node`, `./db/sqlite/bun`, `./db/sqlite/better-sqlite3`, `./db/sqlite/d1`, and `./db/sqlite/durable-object`.

### `@kestack/std-toolkit/sync`

See [src/sync/README.md](src/sync/README.md). It also covers `./sync/paced` and the Sync adapters `./sync/idb` and `./sync/memory`.

### `@kestack/std-toolkit/replica`

See [src/replica/README.md](src/replica/README.md). It also covers the Stores `./replica/idb` and `./replica/memory`.

## Usage

### Define a schema, store it in a table, sync it to the app

The same `Task` schema serves storage and sync. The backend table is realized in memory here; swapping `Memory.make(table)` for a SQLite, IndexedDB, or DynamoDB adapter changes nothing else. A Replica keeps the app's copy of the board fresh, and a Query reads it as an actor's Model. Lifted from the story [old tasks sync into your app in today's shape](stories/old-tasks-sync-into-your-app-in-todays-shape.proof.ts).

```ts
import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/schema';
import { oldToNew, Query, Replica } from '@kestack/std-toolkit/replica';

// 1. The shape of a task; `taskId` identifies one.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

// 2. A table, and Task declared on it: `boardId` fills the partition key.
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const backend = Memory.make(table);

// 3. The app's copy of the board, read from the oldest change forward.
const send = Schema.encodeSync(Task.entity);
const Board = Replica.make('board', { collections: { tasks: Task } });
const BoardLive = Replica.build(Board, {
  gcTime: Infinity,
  collections: {
    tasks: {
      strategy: oldToNew({
        fetch: ({ after }) =>
          table.Task.query('primary', {
            pk: { boardId: 'work' },
            '>=': null,
          }).pipe(
            Effect.map((page) =>
              page.items
                .filter(
                  (item) => after === null || item.meta._u > after.meta._u,
                )
                .map((item) => send(item)),
            ),
            Effect.provide(backend.layer),
          ),
        pollEvery: '1 second',
      }),
    },
  },
});

// 4. A Query: an actor whose Model is the board's tasks.
const Tasks = Query.make('Tasks', {
  props: Schema.Struct({}),
  from: () => Effect.all({ board: Board.get() }),
  query:
    (_, { board }) =>
    (q) =>
      q.from({ t: board.tasks }),
});
```

- `EntityESchema.make(...).build()` produces a schema that encodes with a `_v` stamp and decodes any past version to the latest shape.
- `.entity(Task, (e) => e.primary({ pk: ['boardId'] }))` maps key paths of the value to the table's key attributes; the sort key is always the id field. The built table carries it as `table.Task`. A key path may reach into nested objects and union branches (`owner.teamId`) and must end at a string or number.
- `Memory.make(table).layer` satisfies the `StdTableService<'board'>` requirement of every `table.Task.*` call. Any other adapter's layer does the same.
- Entities travel in encoded form, so `fetch` encodes what the table read; the Collection shows each at its latest version.
- The root actor Provides `Replicas.layer` and places `Replicas.child([BoardLive])`; the app's Layer gives a Store, `Store.idb()` in a browser. See [src/replica/README.md](src/replica/README.md).

### Deploy a table and refuse a breaking change

An application deploys its table through `@kestack/std-toolkit/deploy`. For a persistent table, every deploy compares the new snapshot with the Stored contract kept in the table, and fails before the table is touched if a stored version was edited or removed, or the key layout moved; otherwise it reindexes the rows an index change touches before the Worker goes live. Lifted from the former `apps/alchemy-console/alchemy.run.ts` (tag `alchemy-console-old`).

```ts
import { Stack, Stage } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import {
  D1,
  providers as stdToolkitProviders,
} from '@kestack/std-toolkit/deploy';
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
import { EntityESchema } from '@kestack/std-toolkit/schema';

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

- Setup reindexes an entity when an index or access pattern it uses is added or edited, never for a new version alone: a row whose migration changes an indexed field keeps its old index key until it is next written. It rewrites only rows whose index keys drifted, with `drift` and `reindex`.
- It keeps no progress. The Stored contract is recorded only after the scan, so a setup that stops part-way leaves the old contract, and the next one reindexes again. A row an app write moves meanwhile is read again and retried, up to three times.
- DynamoDB adds a new global secondary index and waits for it before the scan; IndexedDB changes its indexes in a version upgrade first. A disposable table is wiped instead.
- A change no migration can make, such as a value no old row holds, is refused as breaking on a persistent table. The way past is a new physical table and a table migration into it, `StdTable.migrate`: see [stories/evolving-schema](stories/evolving-schema/a-table-migrates-into-a-new-table.proof.ts).
