---
'std-toolkit': patch
---

Reshape every database adapter around one portable table definition.

**Breaking:** all database entrypoints move under `std-toolkit/db`.
`std-toolkit/dynamodb` becomes `std-toolkit/db/dynamodb`, `std-toolkit/sqlite`
becomes `std-toolkit/db/sqlite`, and the SQLite driver paths flatten from
`std-toolkit/sqlite/adapters/*` to
`std-toolkit/db/sqlite/{node,bun,better-sqlite3,durable-object}` — note that
`adapters/do` is now `durable-object`. The `std-toolkit/dynamodb/*` and
`std-toolkit/eschema/*` wildcard subpaths are gone.

**Breaking:** `DynamoTable`, `SQLiteTable`, and `IdbTable` are replaced by a
single `StdTable` from the new `std-toolkit/db` entrypoint. Describe topology
once, then hand the definition to an adapter:

```diff
-const table = DynamoTable.make('users');
+const table = StdTable.make('users').primary('pk', 'sk').build();
+const { layer, setup } = DynamoDB.make(table, config);
```

`.primary(pk, sk)`, `.lsi(...)`, and `.gsi(...)` declare the topology;
`.entity(schema)` and `.singleEntity(schema)` bind entities to it. Every adapter
exposes the same `make(table, config)` shape — `DynamoDB.make`, `SQLite.make`,
`IDB.make`, and `Memory.make(table)` — each returning `{ layer, setup }`.
`idbLayer(dbName)` is replaced by `IDB.database(config)` plus
`IDB.make(table, { database, storeName })`.

**Breaking:** adapter-specific error types are replaced by one `DatabaseError`
carrying a tagged `reason`: `ItemAlreadyExists`, `NoItemToUpdate`,
`PrimaryKeyUpdateNotSupported`, `ConditionFailed`, `InvalidQuery`,
`TransactionTooLarge`, `DuplicateTransactionTarget`, `ForeignTransactionItem`,
`TransactFailed`, `DecodeFailed`, and `OperationFailed`. Match on
`error.reason._tag` instead of catching per-adapter classes.
`DynamoDBNativeError` still surfaces raw client failures.

**Breaking:** `EntityESchema` no longer extends `ESchema`; the two are now
sibling types. Checks like `entity instanceof ESchema` return `false` — use the
`AnyESchema` / `AnyEntityESchema` structural types to accept either.

Add typed transaction validation, `hardDelete(key, 'I KNOW WHAT I AM DOING')`,
and table- or entity-scoped
`dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING')` cleanup.
