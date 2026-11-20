# @kestack/std-toolkit

Single-table design toolkit: database-agnostic sync over single-table item collections, with schema evolution, portable database adapters, and TanStack DB integration

## Big picture

Applications that store many entity types in one table, then mirror that data into a browser, end up writing the same three things by hand: a schema that can still read last year's rows, a storage layer that is bolted to one database, and a sync loop that keeps a client cache fresh. std-toolkit provides each as a separate subpath that shares one Entity model, so they compose without glue code.

`core` defines the Entity envelope and metadata every other subpath speaks. `eschema` gives versioned schemas that migrate on read. `db` defines a StdTable once, and the DynamoDB, SQLite, IndexedDB, and Memory adapters realize it without changing application code. `sync` drives TanStack DB Collections from any backend and persists its replica through the same StdTable contract; `replica` does the same for Kabuki apps, as actors. `snapshot` captures the resulting storage contract as one document per table. Every physical table declares a mode: `persistent` data must survive every schema change, `disposable` data may be thrown away when a change is not safe. Every table keeps the snapshot its data was last set up under inside itself, as three internal entities, and one check compares the code's snapshot with it, then refuses a persistent table's breaking change or wipes a disposable one. It runs at deploy for D1 and DynamoDB, through `alchemy`, and at setup for SQLite files, Durable Objects and IndexedDB. Code that moves data from a layout an earlier release wrote lives in `src/migrations/`, one folder per release, and runs on the next setup or deploy. `@kestack/std-toolkit/snapshot/vitest` is the one test a persistent table needs: it fails unless the table's snapshot has no breaking change against the committed file and every stored version of every entity upgrades. Snapshot never runs at request time.

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
- `alchemy`, `@alchemy.run/cloudflare` and `@alchemy.run/aws` (optional): only `@kestack/std-toolkit/alchemy` imports them, to deploy a table (D1 on Cloudflare, DynamoDB on AWS) and check its snapshot.

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

The one test a persistent table needs; a StdTable kept only in disposable tables needs none. It needs `vitest` as a peer.

```ts
import { expectTableShippable } from '@kestack/std-toolkit/snapshot/vitest';
import { it } from 'vitest';
import { table } from '../src/table.js';

it('keeps the table safe to ship', async () => {
  await expectTableShippable(table, './fixtures/table.snapshot.json');
});
```

The file holds the table snapshot: topology, entities, and every version of every schema the table reaches, compared as parsed data so formatting never fails the test. The test fails, listing every reason, when a stored version of any schema the table reaches does not upgrade or a migration changes a row's id or partition key, when the snapshot has a breaking change against the file, or when the file is out of date. `vitest -u` writes the file only for changes that keep stored rows readable. Nothing accepts a breaking change or a failing upgrade: undo the edit and add a new version, or move the data to a new physical table name. A committed file that cannot be read fails too, even under `-u`, since it is the baseline breaking changes are judged against. The test cannot be enforced, so it is the earliest check, not the only one: the check against the snapshot each table keeps refuses a breaking change too, at deploy or at setup, so a hand-edited or deleted file cannot ship one. For a Durable Object or IndexedDB table, which no deploy sees, it is the only check before the code is live.

| Export                 | What it does                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `expectTableShippable` | Fails unless every stored version upgrades and the table snapshot has no breaking change. |

### `@kestack/std-toolkit/alchemy`

Deploys a StdTable with Alchemy. Each table resource takes a required `mode` and checks the code's snapshot against the one the table keeps, failing the deploy before the table is touched when the change is not safe. The baseline lives in the table, not in Alchemy state. Add `providers()` to the stack's providers, over Cloudflare's for `D1.table` and AWS's (`AWS.providers()`) for `DynamoDB.table`; a DynamoDB deploy without AWS's fails saying so. Under `alchemy dev`, `DynamoDB.table`'s check reads the emulator while Alchemy's table stays on real AWS, so it is not yet usable there.

| Export           | What it does                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DynamoDB.table` | Checks the table's snapshot, creates or updates the DynamoDB table, then records the snapshot; refuses any change that would replace or wipe it. |
| `D1.table`       | Runs SQLite setup in D1 at deploy, which checks the snapshot the table keeps.                                                                    |
| `providers`      | Every provider std-toolkit's resources need, to merge into a stack's `providers`.                                                                |

### `@kestack/std-toolkit/db`

| Export                | What it does                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `StdTable.make`       | Starts a table builder from a logical name; chain `primary`, `lsi`, `gsi`, then `build`.          |
| `DatabaseError`       | Tagged error every StdTable operation fails with, carrying a `reason` such as a failed condition. |
| `storedTableSnapshot` | Reads the snapshot a table keeps, with its mode, or `null` before any setup; it writes nothing.   |
| `SnapshotUnreadable`  | Error raised when the snapshot a table keeps does not read.                                       |

The built `StdTable` exposes `entity`, `singleEntity`, `transact`, `scan`, `subscribe`, `drift`, `reindex`, `dangerouslyRemoveAllItems`, and `storedSnapshot`, read-only surfaces over the three internal entities. See [src/db/CONTEXT.md](src/db/CONTEXT.md).

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

// 2. A table, and Task bound to it: `boardId` fills the partition key.
const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
const board = Memory.make(table);

// 3. The server side of sync: tasks on one board changed after `cursor`.
const changesOn = (boardId: string, cursor: { meta: { _u: string } } | null) =>
  task.query('primary', { pk: { boardId }, '>=': null }).pipe(
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
    Effect.forEach(items, (item) => task.insert(item)).pipe(
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
- `table.entity(Task).primary({ pk: ['boardId'] })` maps key paths of the value to the table's key attributes; the sort key is always the id field. A key path may reach into nested objects and union branches (`owner.teamId`) and must end at a string or number.
- `Memory.make(table).layer` satisfies the `StdTableService<'board'>` requirement of every `task.*` call. Any other adapter's layer does the same.
- `createStdSync` keeps its local copy in memory by default. In a real page pass `store: Sync.idb()` from `@kestack/std-toolkit/sync/idb` to keep it in IndexedDB and let one tab read for all.
- A window's strategy starts when a TanStack query filters on `boardId`. `after` is exclusive: return entities strictly after it.
- `onInsert` writes through to the same table, so the next poll confirms the optimistic row.

### Deploy a table and refuse a breaking change

An application deploys its table through `@kestack/std-toolkit/alchemy`. For a persistent table, every deploy compares the new snapshot with the one the table keeps, and fails before the table is touched if a stored version was edited or removed, or the key layout moved. Lifted from the former `apps/alchemy-console/alchemy.run.ts` (tag `alchemy-console-old`).

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
// Entities register on the table as their modules load; the snapshot must see all of them.
import './src/server/storage/stores/index.ts';

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
    yield* D1.table('ConsoleTable', {
      table: consoleTable,
      database,
      mode: 'persistent',
    });
    return { env: { DB: Database } };
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

- `D1.table` registers one resource whose provider runs SQLite setup in D1. Setup checks the snapshot the table keeps, which is the baseline, before creating the table or reconciling indexes, and refuses a persistent table's breaking change with nothing changed.
- A disposable D1 table is wiped at deploy on a change its rows cannot take. A persistent table never becomes disposable.
- `DynamoDB.table` is a check resource, Alchemy's own table, and a record resource that writes the snapshot once the table is changed; it never wipes or replaces the table.
- At runtime the application provides an adapter layer, `SQLite.make(table, { database }).layer`, and runs no setup.
