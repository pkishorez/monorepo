# Adapter-independent database implementation plan

## Outcome

Replace the separate DynamoDB, SQLite, and IndexedDB Table and Entity stacks with:

- one adapter-independent StdTable and Entity definition API;
- one shared implementation of portable operations;
- one small StdTable contract implemented by every adapter;
- one typed Effect service (StdTableService) for each logical StdTable;
- optional adapter-native services supplied by the same adapter table layer;
- explicit, adapter-specific setup operations.

Vocabulary follows `../CONTEXT.md`: **StdTable** is the abstraction, **StdTableContract** is what each adapter implements, **adapters** (DynamoDB, SQLite, IDB) implement it directly, and SQLite **drivers** sit beneath the SQLite adapter. The words "runtime" (outside Effect's meaning), "binding", and "port" are retired.

This is a direct breaking migration. Existing public APIs and stored key encodings do not need compatibility shims or data migrations.

The behavioral decisions are recorded in [ADR 0004](./adr/0004-adapter-independent-table-runtime.md).

## Architectural boundaries

### Public package entrypoints

The target package surface is:

```text
std-toolkit/db
std-toolkit/db/dynamodb
std-toolkit/db/sqlite
std-toolkit/db/sqlite/node
std-toolkit/db/sqlite/bun
std-toolkit/db/sqlite/better-sqlite3
std-toolkit/db/sqlite/durable-object
std-toolkit/db/idb
```

Remove the legacy `std-toolkit/dynamodb`, `std-toolkit/sqlite`, `std-toolkit/idb`, and `std-toolkit/sqlite/adapters/*` exports after all workspace consumers move to the new entrypoints.

### Deep-module rule

Every callable module has one narrow door:

```text
<module>/
├── index.ts
└── <module>.ts
```

- `index.ts` is a pure barrel that exports only from `<module>.ts`.
- `<module>.ts` assembles the public value and owns its public types.
- Supporting files and nested modules remain private unless they have an explicit package export.
- Adapters consume only the StdTable contract, never kernel entity/table internals.
- Applications consume package entrypoints, never internal source paths.

## Target source structure

The exact supporting files may change while implementing, but the module boundaries and dependency direction should remain stable.

```text
src/db/
├── index.ts
├── db.ts
├── CONTEXT.md
├── docs/
│   ├── plan.md
│   └── adr/
│
├── std-table/
│   ├── definition/        ← table & entity definitions, topology, builders
│   ├── key/               ← primary/compound index key encoding & decoding,
│   │                        storage/index derivation (absorbs the old storage/)
│   ├── entity/            ← per-entity surfaces: keyed, single, query execution
│   ├── table/             ← the aggregate: transact, table decoration
│   ├── contract/          ← StdTableContract, StdTableService, contractLayer,
│   │                        EncodedItem, EncodedKey, ConditionalPut, failures
│   ├── snapshot/          ← logical table snapshot (serves the snapshot tooling)
│   └── error/             ← DatabaseError
│
├── dynamodb/
│   ├── index.ts
│   ├── dynamodb.ts        ← door: DynamoDB.make, DynamoDBConfig, DynamoDBTable
│   ├── domain/            ← pure functions, zero IO
│   │   ├── attribute-value/   ← marshall/unmarshall
│   │   ├── expression/        ← condition/update/key-condition builders
│   │   └── item-schema/       ← itemSchema(table): Schema<DecodedItem, EncodedItem>
│   ├── client/            ← signed HTTP client (the IO edge)
│   ├── table/             ← implements StdTableContract
│   ├── native/            ← DynamoDB-only ops: getItem, update, batchInsert
│   └── setup/             ← CreateTable, infrastructure definition
│
├── sqlite/
│   ├── index.ts
│   ├── sqlite.ts          ← door: SQLite.make, SQLiteConfig, SQLiteTable
│   ├── domain/
│   │   ├── statement/         ← SQL statement builders
│   │   └── item-schema/       ← itemSchema(table): Schema<DecodedItem, EncodedItem>
│   ├── drivers/           ← SQLiteDriver implementations
│   │   ├── node/
│   │   ├── bun/
│   │   ├── better-sqlite3/
│   │   └── durable-object/
│   ├── database/          ← connection over a driver (the IO edge)
│   ├── table/             ← implements StdTableContract
│   └── setup/             ← table creation, additive migration
│
└── idb/
    ├── index.ts
    ├── idb.ts             ← door: IDB.make, IDBConfig, IDBTable
    ├── domain/
    │   └── item-schema/       ← itemSchema(table): Schema<DecodedItem, EncodedItem>
    ├── database/          ← connection/upgrade lifecycle (the IO edge)
    ├── table/             ← implements StdTableContract
    └── setup/             ← versioned store and index upgrades
```

Every module keeps the deep-module door (`index.ts` + `<module>.ts`); supporting files inside each module may vary. Adapters live directly under `db`; there is no additional `adapters` directory. Each adapter has exactly one named layer, `domain/`, holding its pure functions; every peer module is by definition the tier that does IO or assembly. The IO edge keeps its natural name per adapter (`client/` for DynamoDB's signed HTTP client, `database/` for SQLite's and IDB's held connections) — the shape is symmetric, the name is honest. SQLite drivers are nested for cohesion but have independent package exports. `std-toolkit/db/sqlite` must not import any driver module. This keeps environment-specific dependencies out of the base SQLite bundle.

## Dependency graph

```text
ESchema and Snapshot
        │
        ▼
std-table/definition ──────► std-table/key
        │                         │
        ├─────────────────────────┘
        ▼
std-table/entity ──┬───────► std-table/contract
std-table/table  ──┘              ▲
        │                         │
        ▼                   adapter table/
std-table/error                   ▲
                     ┌────────────┼────────────┐
                     │            │            │
                  DynamoDB      SQLite        IDB
                 (domain/ is pure and imported by table/,
                  native/, setup/, and the IO edge)
```

Enforce these rules with Laymos:

- `std-table/*` cannot import the DynamoDB, SQLite, or IndexedDB modules.
- `std-table/definition` cannot import entity, table, or contract modules.
- `std-table/key` cannot import entity/table modules or adapters.
- `std-table/entity` and `std-table/table` can import definitions, keys, the contract, and errors.
- adapters can import the StdTable contract, definitions, keys, and errors — never `std-table/entity` or `std-table/table` internals.
- an adapter's `domain/` modules stay pure: no imports from the adapter's IO edge, `table/`, `native/`, or `setup/`.
- one adapter cannot import another adapter.
- SQLite drivers can import the `SQLiteDriver` interface but not SQLite table internals.
- tests and play files are excluded from production boundary checks.

## Layer graph

### StdTable requirement

Every logical StdTable creates a distinct typed Effect requirement:

```text
StdTable<"people">
├── Entity definitions
├── entity surfaces (portable operations)
└── StdTableService<"people"> requirement
```

Every entity-surface operation returns a `TableEffect<A, Name>` — an Effect that fails with `DatabaseError` and depends only on that requirement:

```text
People.get(...)
    │
    ▼
StdTableService<"people">
    │
    ▼
StdTableContract
```

The StdTable's unique logical name participates in both its TypeScript identity and Effect service identity. An operation for a StdTable without a provided layer therefore remains visible in the Effect environment and cannot be satisfied by an unrelated StdTable's layer.

### Adapter table layer

```text
StdTable + adapter config
             │
             ▼
      <Adapter>.make(...)
             │
             ▼
       <Adapter>Table
       ┌─────┴─────┐
       ▼           ▼
    .layer       .setup
       │           │
       ▼           ▼
StdTableService   Adapter-specific Effect
```

Examples:

```ts
const applicationDatabase = SQLiteNode.make({
  path: './application.sqlite',
});

const peopleSqlite = SQLite.make(peopleTable, {
  database: applicationDatabase,
});

const ordersSqlite = SQLite.make(ordersTable, {
  database: applicationDatabase,
});

const sessionsDynamo = DynamoDB.make(sessionsTable, {
  tableName: 'production-sessions',
  region: 'ap-south-1',
  credentials,
});

const databaseLayer = Layer.mergeAll(
  peopleSqlite.layer,
  ordersSqlite.layer,
  sessionsDynamo.layer,
);
```

The same reusable SQLite or IndexedDB database may back several StdTable layers. It must expose the same Layer instance so Effect memoization shares the connection.

### DynamoDB native service

A DynamoDBTable's layer provides two services backed by one client:

```text
sessionsDynamo.layer
├── StdTableService<"sessions">
└── DynamoTableService<"sessions">
```

Portable operations require the first service. DynamoDB expression updates and other native operations require the second. A SQLite or IndexedDB layer cannot satisfy a DynamoDB-native Effect.

### Setup

Setup is never a portable Effect and never runs while providing `.layer`.

- SQLite setup creates the physical table and adds missing columns and indexes.
- IndexedDB setup performs the required versioned Store and index upgrade.
- DynamoDB setup attempts `CreateTable` and reports an adapter-specific failure; it does not reconcile an existing table.
- `DynamoDB.getTableDefinition(table)` remains pure and needs no configured adapter, credentials, or client.

## StdTable contract

Start with the smallest contract required to implement portable semantics. It moves **encoded items** (`EncodedItem` / `EncodedKey`), and its one write shape is the **conditional put** (`ConditionalPut` with an optional `PutCondition`) — adapters never merge, they only put whole items:

```ts
interface StdTableContract {
  readonly getItem: (
    key: EncodedKey,
  ) => Effect<EncodedItem | null, ContractFailure>;
  readonly queryItems: (
    request: QueryRequest,
  ) => Effect<QueryResult, ContractFailure>;
  readonly writeItem: (put: ConditionalPut) => Effect<void, ContractFailure>;
  readonly transactWriteItems: (
    puts: readonly ConditionalPut[],
  ) => Effect<void, ContractFailure>;
  readonly hardDeleteItem: (key: EncodedKey) => Effect<void, ContractFailure>;
  readonly hardDeleteEntityItems: (
    entity: string,
  ) => Effect<number, ContractFailure>;
  readonly hardDeleteAllItems: () => Effect<number, ContractFailure>;
}
```

Contract types stay bare inside `std-table/contract/` (`EncodedItem`, `QueryRequest`, `QueryPosition`, `ConditionFailure`, `OperationFailure`) — the module path says whose they are. Each adapter converts between `EncodedItem` and its native **decoded item** through one table-parameterized, two-way Effect Schema in its `item-schema/` module: `itemSchema(table): Schema<DecodedItem, EncodedItem>`. Writes run the decode direction, reads the encode direction, and malformed rows fail with a ParseError the adapter maps into `OperationFailure` — no hand-written encode/decode pairs or manual shape checks.

The shared kernel owns:

- ESchema encoding, decoding, and migration;
- Entity Meta `_u` generation through core `nextUlid`;
- Entity discrimination;
- primary, LSI, and GSI key derivation;
- collision-safe composite key encoding;
- portable write conditions (put conditions);
- optimistic `getAndUpdate` retries;
- tombstones and `excludeDeleted`;
- transaction validation;
- portable query validation and ordering;
- query limits after exclusions;
- Entity-based query resumption and typed query-position derivation;
- public `DatabaseError` construction;
- broadcasts after successful commits.

The adapter owns:

- the item schema between encoded and decoded items;
- physical reads, writes, and deletes;
- atomic condition enforcement;
- physical index selection;
- translation of typed query positions into native range starts;
- physical transactions;
- conversion of native failures into private contract failures.

Do not add decoded Entity methods, schema migration, tombstone filtering, or public database errors to an adapter's contract implementation.

## Query resumption boundary

The shared kernel accepts the last returned Entity as `after` and derives a storage position:

```ts
interface QueryPosition {
  readonly pk: string;
  readonly sk: string;
  readonly indexSk?: string;
}
```

- the primary key identifies the exact stored Entity position;
- secondary-index queries include the index sort key as a tie-break;
- adapters receive `startAfter` and translate it into their native range mechanism;
- passing an unrelated Entity acts as a range start rather than an error;
- `hasMore: true` guarantees a non-empty page, so its last Entity can resume the query;
- excluded tombstones may cause several physical pages to be read before satisfying one portable limit.

## Error boundary

Adapters return a private `ContractFailure` union (`ConditionFailure`, `OperationFailure`). The kernel translates it into one public error:

```text
DatabaseError
└── reason
    ├── ItemAlreadyExists
    ├── NoItemToUpdate
    ├── ConditionFailed
    ├── InvalidQuery
    ├── TransactionTooLarge
    ├── DuplicateTransactionTarget
    ├── DecodeFailed
    └── OperationFailed
```

Expected reasons remain independently matchable. `OperationFailed` retains the unexpected native failure as `cause`. Native adapter operations may expose their adapter-specific error types.

## Execution plan

Each phase should leave the package buildable and should be committed independently. Do not remove the old adapter stacks until their replacements and consumers are working.

### Phase 1: Establish boundaries and public skeleton

- [ ] Add `src/db/index.ts` and `src/db/db.ts`.
- [ ] Create the `portable` and `adapters` deep-module skeletons.
- [ ] Add the new `std-toolkit/db*` package exports.
- [ ] Add initial Laymos boundaries for the new modules while leaving old boundaries intact.
- [ ] Add compile-only package-entrypoint tests.
- [ ] Confirm that importing the base SQLite entrypoint does not resolve an environment driver.

Exit criteria:

- New entrypoints compile but may expose only the initial definition API.
- Every new `index.ts` is a pure barrel.
- Both the old and new module trees pass TypeScript and Laymos temporarily.

### Phase 2: Implement logical definitions

- [ ] Implement `Table.make(logicalName)` and its primary/LSI/GSI topology builder.
- [ ] Require explicit index slot names and physical key attribute names.
- [ ] Implement keyed and single Entity definitions.
- [ ] Implement Entity-scoped semantic access-pattern names.
- [ ] Add collision-safe composite key encoding for string components.
- [ ] Produce the adapter-independent Table snapshot.
- [ ] Reject duplicate Table, Entity, index slot, and access-pattern names where applicable.
- [ ] Add type tests preserving the exact logical Table identity through Entity definitions.

Exit criteria:

- One Table definition can describe the topology currently represented independently by all three adapters.
- Its snapshot contains no physical adapter configuration.
- Key encoding is deterministic and has collision tests.

### Phase 3: Add the runtime service and error model

- [ ] Define stored-item, request, result, and private runtime-failure types.
- [ ] Define the minimal `TableRuntime` contract.
- [ ] Create a Table-specific Effect service identity from the logical Table name.
- [ ] Implement `DatabaseError` and its nested reason union.
- [ ] Implement runtime-failure-to-database-error translation.
- [ ] Add type tests proving that two Table requirements remain distinct.
- [ ] Add type tests proving that a missing Table layer remains in the Effect environment.

Exit criteria:

- A deterministic test runtime can provide one logical Table layer.
- An unrelated Table layer cannot satisfy that Table's operations.
- Unexpected runtime failures retain their cause under `OperationFailed`.

### Phase 4: Implement portable operations once

- [ ] Implement stored-item encoding, decoding, and ESchema migration.
- [ ] Implement `get`.
- [ ] Implement `insert` and `insertOp`.
- [ ] Implement optimistic `getAndUpdate` and `getAndUpdateOp`.
- [ ] Implement tombstone `delete`/`deleteOp` and `restore`/`restoreOp`.
- [ ] Include tombstones by default and implement `excludeDeleted`.
- [ ] Implement guarded `hardDelete`.
- [ ] Implement guarded `dangerouslyRemoveAllItems`.
- [ ] Implement single-Entity operations over the same primitives.
- [ ] Implement single-Table transactions with duplicate-target and 100-operation validation.
- [ ] Broadcast mutations only after successful commits.
- [ ] Do not add `queryStream`.

Exit criteria:

- Portable behavior is fully tested against the deterministic runtime.
- Adapters do not need their own Entity builders, readers, writers, or transaction builders.
- Tombstone metadata is preserved in returned Entity values.

### Phase 5: Implement portable queries

- [ ] Implement access-pattern selection and semantic partition-key input.
- [ ] Implement `=`, `<`, `<=`, `>`, `>=`, `between`, and `beginsWith`.
- [ ] Permit `null` as the unbounded value for ordered comparisons.
- [ ] Use descending order for `<` and `<=`; use ascending order otherwise.
- [ ] Enforce exactly one sort-key condition.
- [ ] Default the portable limit to 100.
- [ ] Count the limit after tombstone exclusion.
- [ ] Continue through physical pages until the limit is satisfied or the query is exhausted.
- [ ] Return `hasMore` and guarantee a non-empty page when it is true.
- [ ] Resume with the last returned Entity passed as `after`.

Exit criteria:

- All query semantics pass against the deterministic runtime.
- Query-position derivation and secondary-index tie-breaking are covered by tests.
- An unrelated `after` Entity acts as a range start.
- `beginsWith` queries paginate correctly.

### Phase 6: Replace the SQLite stack

- [ ] Extract a reusable SQLite database-runtime contract.
- [ ] Implement Node, Bun, better-sqlite3, and Durable Object runtime factories.
- [ ] Ensure each reusable runtime exposes a stable memoized database Layer.
- [ ] Implement the portable Table runtime using SQL statements.
- [ ] Translate portable index topology into SQLite indexes, including LSI and GSI slots.
- [ ] Implement adapter-specific topology setup without data migration or index backfill.
- [ ] Make the physical table name optional and default it to the logical Table name.
- [ ] Run the shared adapter conformance suite against every applicable SQLite driver.
- [ ] Move SQLite-specific tests to setup, SQL translation, connection, and failure behavior.

Exit criteria:

- Two logical Tables can share one SQLite database runtime and connection.
- All portable behavior comes from the shared kernel.
- The base SQLite entrypoint contains no Node, Bun, better-sqlite3, or Durable Object imports.

### Phase 7: Replace the IndexedDB stack

- [ ] Implement a reusable IndexedDB database runtime.
- [ ] Implement the portable Table runtime using one Store per logical Table binding.
- [ ] Make `storeName` optional and default it to the logical Table name.
- [ ] Translate LSI and GSI topology into IndexedDB indexes.
- [ ] Implement explicit auto-versioned setup/upgrades.
- [ ] Translate typed query positions into IndexedDB cursor seeks.
- [ ] Run the shared conformance suite with `fake-indexeddb` and browser-relevant tests.

Exit criteria:

- Several logical Tables can share one IndexedDB database runtime.
- Setup adds missing Stores and indexes explicitly.
- IndexedDB exposes no duplicated portable Entity implementation.

### Phase 8: Replace the DynamoDB stack

- [ ] Move the DynamoDB client behind the new adapter orchestrator.
- [ ] Have `DynamoDB.make` accept region, credentials, endpoint, and mandatory physical table name.
- [ ] Construct and own the table-independent client internally.
- [ ] Implement the portable Table runtime using DynamoDB requests.
- [ ] Translate typed query positions into DynamoDB exclusive start keys.
- [ ] Implement explicit setup using `CreateTable` without reconciliation.
- [ ] Implement pure `DynamoDB.getTableDefinition(table)` without TableName or credentials.
- [ ] Supply both portable and DynamoDB-native Table services from the configured layer.
- [ ] Preserve expression update as an explicitly native operation.
- [ ] Preserve `batchInsert` as an explicitly native operation.
- [ ] Run the shared adapter conformance suite against DynamoDB Local.

Exit criteria:

- Infrastructure code can derive topology without constructing a configured adapter.
- Portable operations work unchanged when their Table is switched to DynamoDB.
- DynamoDB-native operations fail at the type level when only a non-DynamoDB layer is provided.

### Phase 9: Migrate workspace consumers

- [ ] Migrate `devtools/lotel` database definitions and layers.
- [ ] Search the full workspace for legacy DynamoDB, SQLite, and IndexedDB imports.
- [ ] Replace adapter-specific Entity types with portable Entity definitions.
- [ ] Replace old database-scoped registries and mutable binding calls.
- [ ] Verify mixed-adapter Layer composition in at least one integration test.

Exit criteria:

- No workspace package imports a legacy database entrypoint.
- No application persistence operation depends on an adapter-specific Entity wrapper.

### Phase 10: Remove legacy implementations

- [ ] Delete the old DynamoDB, SQLite, and IndexedDB Entity stacks.
- [ ] Delete duplicate single-Entity stacks.
- [ ] Delete duplicate mutation, query, transaction, and snapshot implementations.
- [ ] Delete obsolete binding registries and adapter-specific Table builders.
- [ ] Remove old package exports.
- [ ] Replace the transitional Laymos configuration with final boundaries.
- [ ] Remove obsolete tests only after equivalent shared or adapter tests exist.
- [ ] Update adapter READMEs and CONTEXT glossaries.

Exit criteria:

- There is exactly one implementation of every portable operation.
- Each adapter implements only physical runtime, setup, and native behavior.
- No compatibility aliases or dead legacy modules remain.

### Phase 11: Final verification

- [ ] Run formatting.
- [ ] Run TypeScript checking.
- [ ] Run Laymos boundary checking.
- [ ] Run the complete unit and conformance test suite.
- [ ] Run SQLite tests for every supported driver environment available in CI.
- [ ] Run IndexedDB tests with `fake-indexeddb`.
- [ ] Run DynamoDB integration tests against DynamoDB Local.
- [ ] Build package declarations and JavaScript output.
- [ ] Verify every documented package entrypoint from a clean consumer fixture.
- [ ] Verify that browser entrypoints do not include Node-only dependencies.

### Phase 12: StdTable naming and structure revision

Earlier phases were written and executed with the pre-revision vocabulary (`portable/`, "Table runtime", `StoredItem`); their checklists remain a historical record. This phase applies the settled naming from `../CONTEXT.md` and the target source structure above.

- [x] Rename `src/db/portable/` to `src/db/std-table/`; rename `operation/` to `entity/` + `table/`, `runtime/` to `contract/`; merge `storage/` into `key/`; extract `snapshot/` from `definition/`.
- [x] Rename public `Table` to `StdTable`; keep the public definition types (`TableDefinition`, `KeyedEntityDefinition`, ...).
- [x] Rename `TableRuntime` → `StdTableContract`, `TableService`/`tableService` → `StdTableService`, `tableRuntimeLayer` → `contractLayer`, `DbEffect` → `TableEffect`.
- [x] Rename `StoredItem`/`StoredIndexKey` → `EncodedItem`/`EncodedKey`; `RuntimeWriteRequest` → `ConditionalPut` (+ `PutCondition`); drop the `Runtime` prefix from contract types (`QueryRequest`, `QueryResult`, `QueryPosition`, `ConditionFailure`, `OperationFailure`, `ContractFailure`).
- [x] Rename `PortableKeyedEntity`/`PortableSingleEntity`/`PortableTransactionOp` → `KeyedEntity`/`SingleEntity`/`TransactOp`.
- [x] Restructure each adapter to door + `domain/` (pure) + IO edge (`client/` or `database/`) + `table/` + `native/` + `setup/` (+ `drivers/` for SQLite).
- [x] Replace each adapter's `item-codec/` encode/decode pairs with a `item-schema/` two-way Effect Schema `itemSchema(table): Schema<DecodedItem, EncodedItem>`; map ParseErrors into `OperationFailure`.
- [x] Rename `Idb` → `IDB`, `IdbConfiguration` → `IDBConfig`, `SQLiteConfiguration` → `SQLiteConfig`, `DynamoDBConfiguration` → `DynamoDBConfig`, `ConfiguredSQLite` → `SQLiteTable`; name the make results `DynamoDBTable`/`SQLiteTable`/`IDBTable`.
- [x] Rename `SQLiteDatabaseRuntime` → `SQLiteDriver`; keep `IdbDatabaseRuntime`'s replacement consistent with the IDB `database/` module.
- [x] Update Laymos boundaries to the revised dependency rules, including domain-purity rules per adapter.
- [x] Update adapter CONTEXT glossaries and READMEs to the revised vocabulary.

Exit criteria:

- No production source under `src/db` uses the identifiers `portable`, `TableRuntime`, `StoredItem`, or a non-Effect meaning of "runtime".
- Glossary terms and exported symbol names are mechanically identical.
- All conformance, adapter, and entrypoint tests pass unchanged in behavior.

## Shared conformance suite

The shared suite must exercise the same scenarios against every adapter runtime:

- insert and duplicate insert;
- get missing, active, and tombstoned items;
- optimistic update success and conflict retry;
- delete and restore;
- guarded hard deletion;
- primary-index queries;
- every portable sort-key condition;
- LSI and GSI queries;
- forward and descending pagination;
- pagination with excluded tombstones;
- query resumption after a returned, deleted, or unrelated Entity;
- successful atomic transactions;
- failed transaction rollback;
- duplicate transaction targets;
- transaction size limit;
- schema migration and decoding failures;
- adapter failure normalization.

Adapter-specific suites should not repeat portable semantics. They should cover physical translation, setup, infrastructure output, native capabilities, and native failure causes.

## Implementation guardrails

- Do not expose `DynamoEntity`, `SQLiteEntity`, or `IdbEntity` equivalents.
- Do not put adapter choices in Table or Entity definitions.
- Do not store physical names or credentials in logical snapshots.
- Do not expose adapter pagination values directly.
- Derive query positions in the kernel; adapters only translate `startAfter`.
- Do not hide tombstones by default.
- Do not implement portable behavior in adapters to make a test pass.
- Do not automatically run setup from a Layer.
- Do not introduce a global adapter registry or mutable binding API.
- Do not support cross-Table transactions.
- Do not add `queryStream` during this migration.
- Do not retain legacy API aliases after workspace consumers have migrated.

## Completion definition

The migration is complete when an application can define a Table and its Entities once, write all persistence programs against the portable API, and select DynamoDB, SQLite, or IndexedDB independently for each Table by changing only the provided configured-adapter layers. Missing bindings and incompatible native operations must remain visible at the type level, while setup and native capabilities remain explicitly adapter-specific.

## Parity hardening

The post-migration parity audit added these requirements:

- primary-key and id fields are immutable through updates;
- the shared conformance suite covers no-op updates, stale and last-write-wins transactions, singleton ops, primary queries, sparse compound indexes, invalid queries, default limits, whole-Table and Entity cleanup, and decoding failures;
- DynamoDB expression update takes an Entity definition and semantic key, migrates stale data, stamps `_u`, returns and broadcasts an Entity, and rejects key/index/meta changes;
- DynamoDB batch writes are chunked to the native 25-item limit;
- DynamoDB exposes an explicit native consistent-read escape hatch;
- Table-scoped destructive cleanup remains available alongside Entity-scoped cleanup;
- Node and better-sqlite3 drivers accept either a path or a caller-owned connection;
- IndexedDB setup remains idempotent and increments its version only for a required topology change.

Legacy persisted row formats remain intentionally incompatible, as stated in the outcome. Deployments with existing data require an application-owned export/import or physical migration before adopting this breaking release.
