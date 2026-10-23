# @kestack/std-toolkit/db/idb

IndexedDB adapter that realizes a StdTable on a reusable in-browser database connection.

## Big picture

IDB implements the StdTable contract on top of one IndexedDB database. Each StdTable becomes an object store with indexes for its secondary indexes. The store is prepared the first time the table opens the database, which is how IndexedDB works, under a required `mode`. Preparing first compares the table's contract with the Stored contract kept in the same database, in the reserved `_std_contract` store. A `persistent` store refuses a breaking change with `SetupRefused` and is never wiped; it reindexes its rows for a change that needs a backfill. A `disposable` store is cleared on a breaking change, and for a change that needs a backfill it reindexes or clears, as `onBackfill: 'reindex' | 'wipe'` chooses (`reindex` by default). A persistent store never becomes disposable. Then it creates the store and its indexes and records the new contract. `IDB.setup` does the same at a moment the page chooses, since an upgrade waits for other open tabs, and lets the page handle `SetupRefused` itself. Divergences from the DynamoDB topology are in [CONTEXT.md](CONTEXT.md); the shared vocabulary is in [db/CONTEXT.md](../CONTEXT.md). The browser sync preset uses this adapter for its Sync Store.

## Install

See the [top README](../../../README.md).

## Exports

### `@kestack/std-toolkit/db/idb`

| Export         | What it does                                                                              |
| -------------- | ----------------------------------------------------------------------------------------- |
| `IDB.make`     | Realizes a StdTable on a database connection; returns `storeName` and `layer`.            |
| `IDB.setup`    | Prepares the store under its Stored contract now instead of on first open.                |
| `IDB.database` | Returns a reusable connection to a named IndexedDB database, cached per name and factory. |
| `SetupRefused` | Error raised when preparing a persistent store is refused; nothing is changed.            |

## Usage

### Run a program on IndexedDB

The program is the same one any adapter runs; only the layer changes.

```ts
import { Effect } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';

const table = StdTable.make('board').primary('pk', 'sk').build();

const idb = IDB.make(table, {
  database: IDB.database({ databaseName: 'board' }),
  // A local copy that can be fetched again: thrown away on a breaking change.
  mode: 'disposable',
});

// The store is prepared the first time the layer opens the database.
const program = saveAndRead.pipe(Effect.provide(idb.layer));
```

- One `IDB.database` connection can serve several StdTables; each gets its own store.
- Pass `indexedDB` in the database config to use a different factory, such as `fake-indexeddb` in tests.
- `storeName` defaults to the table's logical name; `_std_contract` is reserved.
- The Sync and Replica IndexedDB stores use `mode: 'disposable'`, since the Backend holds the data.
