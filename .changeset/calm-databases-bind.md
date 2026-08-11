---
'std-toolkit': patch
---

Reshape the DynamoDB, SQLite, and IndexedDB adapters around explicit table topology, database-scoped runtimes, and shared persistence errors.

**Breaking:** `DynamoTable.make(logicalName)` now requires a logical table identity. Create table-independent clients with `DynamoDB.client(config)` and bind logical tables to physical names with `DynamoDB.layer(...bindings)`. Table and entity failures are now direct `DynamoDBError` variants rather than a wrapped error value.

**Breaking:** SQLite table names now belong to `SQLiteTable.make(tableName)`, while runtime adapter layers accept only their database handle. The runtime and error exports are now named `SQLiteDatabase` and `SQLiteError`.

**Breaking:** IndexedDB store names now belong to `IdbTable.make(storeName)`, while `idbLayer(dbName)` is scoped to the complete database and can serve multiple tables. The `std-toolkit/idb/*` wildcard export has been removed, and failures are exposed as `IdbError`.

Add shared tagged persistence failures across adapters, typed transaction validation, `hardDelete(key, 'I KNOW WHAT I AM DOING')`, and table- or entity-scoped `dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING')` cleanup.

**Breaking:** `EntityESchema` no longer extends `ESchema`; the two are now sibling types. Checks like `entity instanceof ESchema` return `false` — use the `AnyESchema` / `AnyEntityESchema` structural types to accept either.
