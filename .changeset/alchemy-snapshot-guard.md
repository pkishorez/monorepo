---
'std-toolkit': patch
---

Table-level enforcement moves to deploy time. The new `std-toolkit/alchemy` subpath deploys a table with `DynamoDB.table` or `D1.table`; each runs a snapshot guard that keeps the last accepted table snapshot in Alchemy state and fails the deploy with `SnapshotIncompatible` when the new one is not upgradable. Merge `providers()` from `std-toolkit/alchemy` into the stack's providers. `std-toolkit/db/dynamodb/alchemy` is removed; its table resource is part of `DynamoDB.table`.

Adapters return only the layer from `make`. `table.verifySnapshot()` and `table.snapshot()` are removed, and nothing is stored inside the table any more. Create physical tables with `SQLite.setup(table, config)`, `IDB.setup(table, config)` (or let IndexedDB upgrade on first open), or `DynamoDB.createTable(table, config)` for DynamoDB Local; `DynamoDB.deleteTable(config)` replaces `teardown`. `SQLite.setup` deletes the baseline item earlier releases stored in the table.

Snapshot is table-only. `Snapshot` becomes `TableSnapshot` with `capture`, `parse`, `diff`, and `renderChanges`, and the ESchema-only document is gone. `render`, `restore`, and `isUpgradable` are removed. The `std-toolkit snapshot` CLI and its file-based baseline are removed; the recommended test is `expectTableSnapshot(table, file)` from `std-toolkit/snapshot/vitest`, which compares the committed file as parsed data. The snapshot document is an ESchema at `v1` with no migration from earlier formats, so re-accept committed snapshot files with `vitest -u`. `TableSnapshotSchema`, `ESchemaSnapshotSchema`, `ContractSnapshotSchema`, and `SnapshotFormatRetired` are replaced by `TableSnapshotESchema`.
