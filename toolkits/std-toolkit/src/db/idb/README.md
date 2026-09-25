# std-toolkit/db/idb

IndexedDB adapter that realizes a StdTable on a reusable in-browser database connection.

## Big picture

IDB implements the StdTable contract on top of one IndexedDB database. Each StdTable becomes an object store with indexes for its secondary indexes. The store and its indexes are created or upgraded the first time the table opens the database, which is how IndexedDB works. `IDB.setup` does the same upgrade at a moment the page chooses, since an upgrade waits for other open tabs. Divergences from the DynamoDB topology are in [CONTEXT.md](CONTEXT.md); the shared vocabulary is in [db/CONTEXT.md](../CONTEXT.md). The browser sync preset uses this adapter for its Sync Store.

## Install

See the [top README](../../../README.md).

## Exports

### `std-toolkit/db/idb`

| Export         | What it does                                                                              |
| -------------- | ----------------------------------------------------------------------------------------- |
| `IDB.make`     | Realizes a StdTable on a database connection; returns `storeName` and `layer`.            |
| `IDB.setup`    | Creates or upgrades the store and its indexes now instead of on first open.               |
| `IDB.database` | Returns a reusable connection to a named IndexedDB database, cached per name and factory. |

## Usage

### Run a program on IndexedDB

Lifted from story 24.

```ts
import { Effect } from 'effect';
import { StdTable } from 'std-toolkit/db';
import { IDB } from 'std-toolkit/db/idb';

const table = StdTable.make('board').primary('pk', 'sk').build();

const idb = IDB.make(table, {
  database: IDB.database({ databaseName: 'board' }),
});

// The store is created the first time the layer opens the database.
const program = saveAndRead.pipe(Effect.provide(idb.layer));
```

- One `IDB.database` connection can serve several StdTables; each gets its own store.
- Pass `indexedDB` in the database config to use a different factory, such as `fake-indexeddb` in tests.
- `storeName` defaults to the table's logical name.
