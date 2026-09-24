# std-toolkit

Single-table design toolkit: database-agnostic sync over single-table item collections, with schema evolution, portable database adapters, and TanStack DB integration

## Big picture

Applications that store many entity types in one table, then mirror that data into a browser, end up writing the same three things by hand: a schema that can still read last year's rows, a storage layer that is bolted to one database, and a sync loop that keeps a client cache fresh. std-toolkit provides each as a separate subpath that shares one Entity model, so they compose without glue code.

`core` defines the Entity envelope and metadata every other subpath speaks. `eschema` gives versioned schemas that migrate on read. `db` defines a StdTable once, and the DynamoDB, SQLite, IndexedDB, and Memory adapters realize it without changing application code. `sync` drives TanStack DB Collections from any backend and persists its replica through the same StdTable contract. `snapshot` and `studio-rpc` inspect and guard the resulting storage contract; every adapter's `setup` enforces it against the baseline kept inside the table, and `std-toolkit/snapshot/vitest` is the one test a table needs.

Each subpath owns its vocabulary in a `CONTEXT.md`: [core](src/core/CONTEXT.md), [eschema](src/eschema/CONTEXT.md), [snapshot](src/snapshot/CONTEXT.md), [db](src/db/CONTEXT.md), [sync](src/sync/CONTEXT.md). The [context map](CONTEXT-MAP.md) explains how they relate. Decisions live in [docs/adr/](docs/adr/), [src/db/docs/adr/](src/db/docs/adr/), and [src/sync/docs/adr/](src/sync/docs/adr/). Longer reads: [Evolving schema](docs/evolving-schema.md), [Sync guide](docs/sync-guide.md). The [stories](stories/) folder is a guided walkthrough that runs as tests.

## Install

```sh
npm install std-toolkit effect
```

Node 24 or later. Peer dependencies:

- `effect` (required): every subpath is built on Effect Services, Layers, and Schema.
- `@tanstack/react-db` (optional): `std-toolkit/sync` creates and drives TanStack DB Collections.
- `react` (optional): required by `@tanstack/react-db`; only needed when you use `std-toolkit/sync`.
- `alchemy` (optional): only `std-toolkit/db/dynamodb/alchemy` imports it, to declare the DynamoDB table as an Alchemy resource.

## Exports

### `std-toolkit/core`

See [src/core/README.md](src/core/README.md).

### `std-toolkit/eschema`

See [src/eschema/README.md](src/eschema/README.md).

### `std-toolkit/snapshot`

| Export                     | What it does                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `Snapshot.capture`         | Captures an ESchema into a JSON-safe snapshot of every encoded and decoded version.              |
| `Snapshot.decode`          | Reads a stored snapshot document, migrating older document formats forward.                      |
| `Snapshot.decodeTableFile` | Reads a committed table snapshot file: the contract plus its golden rows.                        |
| `Snapshot.restore`         | Rebuilds working ESchemas from snapshot definitions without the original source.                 |
| `Snapshot.inspect`         | Lists the limitations in a snapshot that cannot be verified from its data.                       |
| `Snapshot.diff`            | Compares a baseline and a current snapshot into classified semantic changes.                     |
| `Snapshot.diffTableFile`   | Compares two table snapshot files, adding a breaking change for every migration step that moved. |
| `Snapshot.render`          | Renders a snapshot as stable human-readable text.                                                |
| `Snapshot.renderChanges`   | Renders a list of changes as human-readable text.                                                |
| `ESchemaSnapshotESchema`   | The ESchema of a single ESchema snapshot document.                                               |
| `TableSnapshotESchema`     | The ESchema of a table snapshot document: topology, entities, access patterns, schemas.          |
| `TableSnapshotFileESchema` | The ESchema of the file a test suite commits per table: the table snapshot plus golden rows.     |
| `SnapshotDecodeError`      | Error raised when a stored snapshot cannot be decoded.                                           |
| `SnapshotIdentityConflict` | Error raised when two distinct ESchemas share one snapshot identity.                             |
| `SnapshotIncompatible`     | Error raised by table-level enforcement when a change would break the approved baseline.         |

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

The file holds the table's schema contract and twenty **golden rows** per migration step: generated values of the previous version and what the step turns them into. A rewritten or impure migration changes a stored output and fails as `breaking`; an appended version adds rows and is `safe`. On a mismatch the failure lists every change with its classification. `vitest -u` accepts the current document, like any file snapshot. Rows are drawn once when a step first enters the file and replayed from the file afterwards, so they never enter a table and a generator change never looks like a rewrite.

| Export                     | What it does                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `expectTableSnapshot`      | Captures the table's snapshot file with the committed one as prior and file-snapshots it. |
| `captureTableSnapshotFile` | The same capture without Vitest: contract plus golden rows, replaying a prior file.       |
| `captureGoldenRows`        | Only the golden rows.                                                                     |
| `GoldenRowError`           | Error raised when a version cannot generate values or a migration fails on one.           |

### `std-toolkit/studio-rpc`

See [src/studio-rpc/README.md](src/studio-rpc/README.md).

### `std-toolkit/db`

| Export          | What it does                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `StdTable.make` | Starts a table builder from a logical name; chain `primary`, `lsi`, `gsi`, then `build`.          |
| `DatabaseError` | Tagged error every StdTable operation fails with, carrying a `reason` such as a failed condition. |

The built `StdTable` exposes `entity`, `singleEntity`, `transact`, `scan`, `subscribe`, `snapshot`, `drift`, `reindex`, and `dangerouslyRemoveAllItems`. Enforcement is not a method: every adapter's `setup` runs it (see below). `BaselineMissing` is the error setup fails with when a table already holds rows but no baseline. See [src/db/CONTEXT.md](src/db/CONTEXT.md).

### `std-toolkit/db/dynamodb`

See [src/db/dynamodb/README.md](src/db/dynamodb/README.md).

### `std-toolkit/db/dynamodb/alchemy`

See [src/db/dynamodb/alchemy/README.md](src/db/dynamodb/alchemy/README.md).

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
