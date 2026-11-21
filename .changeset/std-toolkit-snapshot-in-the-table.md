---
'@kestack/std-toolkit': patch
---

Every table keeps its snapshot inside itself, as three internal entities, and one check runs against it everywhere ([ADR 0020](https://github.com/pkishorez/monorepo/blob/main/toolkits/std-toolkit/docs/adr/0020-the-snapshot-lives-in-the-table.md)). It runs at deploy for D1 and DynamoDB, and at setup for SQLite files, Durable Objects and IndexedDB.

**Breaking**

- Every StdTable registers `__snapshot`, `__snapshot_entity` and `__snapshot_version`, and entity names starting `__` are reserved. Table-wide reads and change notices skip them. Every committed table snapshot file gains them: run `vitest -u` once.
- The Stored contract (`_std_contract`) and the Deployed contract in Alchemy state are gone. SQLite files, D1 and Durable Objects need nothing: the next setup or deploy moves the old contract into the table. IndexedDB deletes the old `_std_contract` store on first open, so a disposable store from before is wiped once and fetched again. `_std_contract` stays a reserved name.
- `DeployGuard` and `DeployGuard.table` are removed. A Durable Object or IndexedDB table is checked when it is set up; to catch a breaking change before it ships, run `expectTableShippable` in CI. Alchemy deletes the old `StdToolkit.DeployGuard` and `StdToolkit.SnapshotGuard` resources on the next deploy.
- `DynamoDB.table` is three resources: `<id>SnapshotCheck`, Alchemy's table, and `<id>SnapshotRecord`. It needs AWS's providers under std-toolkit's: `providers().pipe(Layer.provideMerge(AWS.providers()))`. An existing DynamoDB table has no snapshot yet, so its first deploy records the code's; a change only a new table could make is still refused, against the live table's keys. It does not work under `alchemy dev` yet.
- `D1.table` and `DynamoDB.table` keep the order a table declares its local secondary indexes in.
- `__snapshot` holds the SHA-256 of the snapshot its table's items match, so an unchanged table is checked on that one read. `SQLite.setup` now runs asynchronously, as it hashes through WebCrypto.

**Added**

- `DynamoDB.describeTable(config)`, from `@kestack/std-toolkit/db/dynamodb`: the physical table's keys and indexes, or `undefined` when it does not exist.
- `table.storedSnapshot`, read-only surfaces over a table's three internal entities, and `storedTableSnapshot(table)`, from `@kestack/std-toolkit/db`: the snapshot and mode the table keeps, or `null` before any setup. Neither can write them.
- `consistent` on the StdTable contract's query request: a strongly consistent query, which DynamoDB refuses on a global secondary index.
