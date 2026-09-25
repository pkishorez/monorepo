# std-toolkit

Single-table design toolkit: database-agnostic sync over single-table item collections, with schema evolution, portable database adapters, and TanStack DB integration

## Big picture

Applications that store many entity types in one table, then mirror that data into a browser, end up writing the same three things by hand: a schema that can still read last year's rows, a storage layer that is bolted to one database, and a sync loop that keeps a client cache fresh. std-toolkit provides each as a separate subpath that shares one Entity model, so they compose without glue code.

`core` defines the Entity envelope and metadata every other subpath speaks. `eschema` gives versioned schemas that migrate on read. `db` defines a StdTable once, and the DynamoDB, SQLite, IndexedDB, and Memory adapters realize it without changing application code. `sync` drives TanStack DB Collections from any backend and persists its replica through the same StdTable contract. `snapshot` captures the resulting storage contract as one document per table, and `studio-rpc` serves it to Std Studio. `alchemy` deploys a table and refuses a deploy that would break a stored version, keeping the accepted snapshot in Alchemy state. `std-toolkit/snapshot/vitest` is the one test a table needs. Snapshot never runs inside an adapter or at request time.

Each subpath owns its vocabulary in a `CONTEXT.md`: [core](src/core/CONTEXT.md), [eschema](src/eschema/CONTEXT.md), [snapshot](src/snapshot/CONTEXT.md), [db](src/db/CONTEXT.md), [sync](src/sync/CONTEXT.md). The [context map](CONTEXT-MAP.md) explains how they relate. Decisions live in [docs/adr/](docs/adr/), [src/db/docs/adr/](src/db/docs/adr/), and [src/sync/docs/adr/](src/sync/docs/adr/). Longer reads: [Evolving schema](docs/evolving-schema.md), [Sync guide](docs/sync-guide.md). The [stories](stories/) folder is a guided walkthrough that runs as tests.

## Install

```sh
npm install std-toolkit effect
```

Node 24 or later. Peer dependencies:

- `effect` (required): every subpath is built on Effect Services, Layers, and Schema.
- `@tanstack/react-db` (optional): `std-toolkit/sync` creates and drives TanStack DB Collections.
- `react` (optional): required by `@tanstack/react-db`; only needed when you use `std-toolkit/sync`.
- `alchemy` (optional): only `std-toolkit/alchemy` imports it, to deploy a table and guard its snapshot.

## Exports

### `std-toolkit/core`

See [src/core/README.md](src/core/README.md).

### `std-toolkit/eschema`

See [src/eschema/README.md](src/eschema/README.md).

### `std-toolkit/snapshot`

| Export                        | What it does                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `TableSnapshot.capture`       | Captures a table's contract as plain data: topology, entities, and every schema version.   |
| `TableSnapshot.parse`         | Reads a stored document, migrating older formats forward and validating its references.    |
| `TableSnapshot.diff`          | Compares a previous and a current snapshot into classified semantic changes.               |
| `TableSnapshot.isUpgradable`  | Says whether a change list leaves every row written under the previous snapshot readable.  |
| `TableSnapshot.render`        | Renders a snapshot as stable human-readable text.                                          |
| `TableSnapshot.renderChanges` | Renders a list of changes as human-readable text, grouped by impact.                       |
| `TableSnapshot.restore`       | Rebuilds live Effect schemas for every version in a snapshot, without the original source. |
| `TableSnapshotESchema`        | The ESchema of the stored table snapshot document.                                         |
| `SnapshotChangeSchema`        | The Schema of one classified change.                                                       |
| `SnapshotDecodeError`         | Error raised when a stored snapshot cannot be read.                                        |
| `SnapshotIdentityConflict`    | Error raised when two distinct ESchemas share one snapshot identity.                       |
| `SnapshotIncompatible`        | Error raised when a new snapshot is not upgradable from the accepted one.                  |

### `std-toolkit/snapshot/vitest`

The recommended test for a table, in one call. It needs `vitest` as a peer.

```ts
import { expectTableSnapshot } from 'std-toolkit/snapshot/vitest';
import { it } from 'vitest';
import { table } from '../src/table.js';

it('keeps the table in step with its committed snapshot', async () => {
  await expectTableSnapshot(table, './fixtures/table.snapshot.json');
});
```

The file holds the table snapshot: topology, entities, and every version of every schema the table reaches. It is compared as parsed data, so formatting never fails the test. On a mismatch the failure lists every change with its classification. `vitest -u` accepts the current document, like any file snapshot.

| Export                | What it does                                                           |
| --------------------- | ---------------------------------------------------------------------- |
| `expectTableSnapshot` | Captures the table's snapshot and compares it with the committed file. |

### `std-toolkit/alchemy`

Deploys a StdTable with Alchemy. Each target makes the table exist and runs the **snapshot guard**: a resource that keeps the last accepted table snapshot in Alchemy state and fails the deploy when the new one is not upgradable from it. Add `providers()` to the stack's providers.

| Export                  | What it does                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `DynamoDB.table`        | Creates the DynamoDB table with every index from the topology, then guards its snapshot. |
| `D1.table`              | Guards the snapshot, then creates the table and reconciles its indexes in a D1 database. |
| `guardTable`            | Registers a snapshot guard for a table, for a target the toolkit does not ship.          |
| `SnapshotGuard`         | The Alchemy resource behind `guardTable`.                                                |
| `SnapshotGuardProvider` | The provider layer for `SnapshotGuard`.                                                  |
| `providers`             | Every provider std-toolkit's resources need, to merge into a stack's `providers`.        |

### `std-toolkit/studio-rpc`

See [src/studio-rpc/README.md](src/studio-rpc/README.md).

### `std-toolkit/db`

| Export          | What it does                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `StdTable.make` | Starts a table builder from a logical name; chain `primary`, `lsi`, `gsi`, then `build`.          |
| `DatabaseError` | Tagged error every StdTable operation fails with, carrying a `reason` such as a failed condition. |

The built `StdTable` exposes `entity`, `singleEntity`, `transact`, `scan`, `subscribe`, `drift`, `reindex`, and `dangerouslyRemoveAllItems`. See [src/db/CONTEXT.md](src/db/CONTEXT.md).

### `std-toolkit/db/dynamodb`

See [src/db/dynamodb/README.md](src/db/dynamodb/README.md).

### `std-toolkit/db/idb`

See [src/db/idb/README.md](src/db/idb/README.md).

### `std-toolkit/db/memory`

See [src/db/memory/README.md](src/db/memory/README.md).

### `std-toolkit/db/sqlite`

See [src/db/sqlite/README.md](src/db/sqlite/README.md). It also covers the driver entrypoints `./db/sqlite/node`, `./db/sqlite/bun`, `./db/sqlite/better-sqlite3`, `./db/sqlite/d1`, and `./db/sqlite/durable-object`.

### `std-toolkit/sync`

See [src/sync/README.md](src/sync/README.md). It also covers `./sync/paced`, `./sync/leadership/in-memory`, and `./sync/platform/browser`.

## Usage

### Define a schema, store it in a table, sync it to the browser

The same `Task` schema serves storage and sync. The table is realized in memory here; swapping `Memory.make(table)` for a SQLite, IndexedDB, or DynamoDB adapter changes nothing else. The sync instance polls the table for changes and projects them into a TanStack DB Collection. Lifted from stories 01, 03, and 25.

```ts
import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { Effect, Schedule, Schema } from 'effect';
import { StdTable } from 'std-toolkit/db';
import { Memory } from 'std-toolkit/db/memory';
import { EntityESchema } from 'std-toolkit/eschema';
import { createStdSync, syncStore, syncStrategy } from 'std-toolkit/sync';
import { inMemoryLeadership } from 'std-toolkit/sync/leadership/in-memory';

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
const app = createStdSync({
  name: 'board',
  platform: {
    storeLayer: Memory.make(syncStore).layer,
    leadershipLayer: inMemoryLeadership(),
  },
});
const tasks = app.collection({
  schema: Task,
  sync: {
    partitions: {
      boardId: (boardId) => ({
        strategy: syncStrategy.oldToNew({
          source: ({ poll }) =>
            poll({
              fetch: ({ cursor }) => changesOn(boardId, cursor),
              schedule: Schedule.spaced('1 second'),
            }),
        }),
      }),
    },
  },
  onInsert: (items) =>
    Effect.forEach(items, (item) => task.insert(item)).pipe(
      Effect.provide(board.layer),
    ),
});

// 5. A live query for the `work` board starts the sync for that partition.
const screen = createLiveQueryCollection({
  query: (q) =>
    q.from({ task: tasks }).where(({ task }) => eq(task.boardId, 'work')),
  startSync: true,
});
```

- `EntityESchema.make(...).build()` produces a schema that encodes with a `_v` stamp and decodes any past version to the latest shape.
- `table.entity(Task).primary({ pk: ['boardId'] })` maps schema fields to the table's key attributes; the sort key is always the id field.
- `Memory.make(table).layer` satisfies the `StdTableService<'board'>` requirement of every `task.*` call. Any other adapter's layer does the same.
- `createStdSync` needs a platform only to persist its replica (`syncStore` is itself a StdTable) and to elect a leader. In a real page use `browser()` from `std-toolkit/sync/platform/browser`.
- A partition worker starts when a TanStack query filters on `boardId`. `cursor` is exclusive: return entities strictly after it.
- `onInsert` writes through to the same table, so the next poll confirms the optimistic row.

### Deploy a table and refuse a breaking change

An application deploys its table through `std-toolkit/alchemy`. The first deploy records the table snapshot in Alchemy state. Every later deploy compares the new snapshot with the accepted one and fails before the table is touched if a stored version was edited or removed, or the key layout moved. Lifted from `apps/alchemy-console/alchemy.run.ts`.

```ts
import { Stack, Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { D1, providers as stdToolkitProviders } from 'std-toolkit/alchemy';
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
    yield* D1.table('ConsoleTable', { table: consoleTable, database });
    return { env: { DB: Database } };
  }),
);

export default Stack(
  'AlchemyConsole',
  {
    providers: Layer.merge(Cloudflare.providers(), stdToolkitProviders()),
    state: Cloudflare.state(),
  },
  Worker,
);
```

- `D1.table` runs the snapshot guard, then an action that creates the table and reconciles its indexes. The action runs again only when the accepted snapshot changes.
- `DynamoDB.table` does the same for DynamoDB; the table resource creates the indexes itself, so no setup action follows.
- At runtime the application provides an adapter layer, `SQLite.make(table, { database }).layer`, and never touches snapshot.
- The guard is only as durable as the Alchemy state store behind the stack.
