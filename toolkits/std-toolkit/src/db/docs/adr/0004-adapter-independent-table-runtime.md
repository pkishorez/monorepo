---
status: accepted
---

# Use adapter-independent Tables with per-Table runtimes

## Amendment (2026-08-13): StdTable vocabulary

The behavioral decisions below stand unchanged. The naming this ADR introduced is superseded by the revised ubiquitous language in `../../CONTEXT.md`:

- The adapter-independent abstraction is the **StdTable** (`StdTable.make`), not bare `Table`. There is no intermediate "port" or "binding" concept: the StdTable is itself the interface each adapter implements.
- "Table runtime" is retired. The obligation adapters fulfill is the **StdTable contract** (`StdTableContract`), reached through the per-logical-name **`StdTableService`**; the word "runtime" now refers only to Effect's runtime.
- "Configured adapter" is retired. `<Adapter>.make(stdTable, config)` returns an **adapter table** (`DynamoDBTable`, `SQLiteTable`, `IDBTable`) taking an **adapter config** (`DynamoDBConfig`, `SQLiteConfig`, `IDBConfig`); brand-faithful casing includes `IDB`.
- Items crossing the contract are **encoded items** (`EncodedItem`/`EncodedKey`, replacing `StoredItem`); the contract's one write shape is the **conditional put** (`ConditionalPut` + `PutCondition`, replacing `RuntimeWriteRequest`). Each adapter converts to its native **decoded item** through a two-way Effect Schema (`itemSchema(table): Schema<DecodedItem, EncodedItem>`) instead of hand-written codec pairs.
- SQLite's per-platform implementations are **drivers** (`SQLiteDriver`, replacing `SQLiteDatabaseRuntime`).

Where the text below says "Table runtime", read "StdTable contract"; where it says "configured adapter", read "adapter table".

The DynamoDB, SQLite, and IndexedDB adapters currently duplicate the same single-table topology, Entity builders, index derivation, CRUD behavior, transaction operations, tombstone handling, and snapshot capture. This makes portability structural rather than real: application code still selects adapter-specific Table and Entity types, and the implementations can drift. We will replace these parallel public models with one adapter-independent `Table` and one shared implementation of the portable Entity surface. Each database adapter will implement a minimal internal Table runtime and provide it through a typed Effect layer for one logical Table.

This is a breaking change. There is no production data or API compatibility requirement, so the implementation will not retain legacy key codecs, dual reads, or long-lived compatibility wrappers.

## Amendment (2026-08-14): readable composite keys

Composite key encoding returns to `#` joining, with `\` and `#` escaped within each component.

A prefix-free encoding that terminated each component with `\0\0` was collision-safe and gave a provably correct order across component boundaries. It cost too much elsewhere. A semantic prefix stopped being a physical prefix, so `beginsWith` could no longer reach the database. The kernel had to read a whole item collection and filter it in memory, which is O(partition) where a native range scan is O(matches).

Escaping keeps every property that matters. The encoding stays injective, so two distinct logical keys cannot collide on one physical key. It stays a prefix-preserving map, so `beginsWith` pushes down to `begins_with` on DynamoDB, a range on SQLite, and an `IDBKeyRange` on IDB. Output is byte-identical to plain `#` joining for any component that contains neither `#` nor `\`, so stored data written before this change stays reachable. Keys remain readable in a console: `Order#01H2X`.

The accepted cost is order across component boundaries. `\0` sorts below every character; `#` is `0x23`, so an index component containing a space, `!`, or `"` can sort before the separator. A sort-key condition is unaffected when the earlier components are equal, because only the last component is compared. A condition that straddles different leading components can order rows incorrectly. This matches the toolkit's behaviour before the prefix-free encoding, so it is a retained property, not a regression.

## Logical definitions

Applications define topology and Entities once:

```ts
const peopleTable = Table.make('people')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const people = peopleTable
  .entity(personSchema)
  .primary({ pk: ['organizationId'] })
  .index('GSI1', 'byEmail', { pk: ['email'] })
  .index('LSI1', 'byCreatedAt', { sk: ['createdAt'] })
  .build();
```

The Table's logical name is unique within an application. It is both the TypeScript identity of the required Table runtime and the Effect service identity used at runtime. This lets TypeScript report a missing binding for a specific Table instead of proving only that some database service exists. Entity definitions retain their Table identity, and `transact` rejects operations from another Table.

The shared topology follows DynamoDB semantics and limits. An LSI inherits the primary partition-key attribute and declares only a different sort-key attribute. A GSI declares independent partition-key and sort-key attributes. Index slot names and physical key attribute names are explicit; the toolkit does not derive one from the other. Generic slots such as `LSI1` and `GSI1` remain separate from Entity-scoped access-pattern names such as `byCreatedAt` and `byEmail`.

Index components are ESchema-encoded strings. Composite keys escape `\` and `#` within each component and then join the components with `#`, rather than using implicit `String` coercion. Entity values on the portable surface are ESchema-encoded JSON-compatible values.

The logical Table snapshot is adapter-independent. It contains the logical name, primary/LSI/GSI topology, ESchema history, and Entity access-pattern derivations. It excludes adapter names, physical names, credentials, database paths, runtime adapters, singleton defaults, and infrastructure options.

## Configured adapters and layers

Each adapter configures one logical Table:

```ts
const configuredPeople = SQLite.make(peopleTable, {
  database: makeNodeSQLite({ path: './application.db' }),
  tableName: 'people_data',
});

configuredPeople.layer;
configuredPeople.setup;
```

`Adapter.make(Table, configuration)` returns a configured adapter. Its layer supplies the typed runtime for that exact logical Table. Applications can merge configured adapters in any combination: every Table can use SQLite, every Table can use DynamoDB, or different Tables can use different adapters. A reusable SQLite runtime can serve multiple physical tables in one file, and a reusable IndexedDB runtime can serve multiple Stores in one database.

SQLite physical table names and IndexedDB Store names are optional and default to the logical Table name. DynamoDB physical table names are mandatory. DynamoDB configuration supplies region, credentials, and an optional endpoint; `DynamoDB.make` constructs and owns its table-independent client rather than requiring callers to create one.

The configured adapter is not part of application persistence code. Portable Entity operations require only the Table-specific runtime supplied by its layer.

## Shared portable implementation

The shared database kernel implements portable behavior once. Adapters do not define `DynamoEntity`, `SQLiteEntity`, or `IdbEntity` versions of that behavior. They implement a minimal internal Table runtime for physical reads, conditional writes, queries, typed query positions, atomic transactions, hard deletion, value encoding, and adapter-error normalization.

Entity Meta `_u` is portable behavior. The shared kernel obtains every inserted or updated `_u` from core's `nextUlid`, including single-Entity and transaction writes. Adapter runtimes receive complete stored items and only persist the supplied `_u`; they do not generate versions. Tests that need repeatable values replace the existing `Ulid` Effect service.

The initial keyed Entity surface is:

- `get`
- `insert` / `insertOp`
- `getAndUpdate` / `getAndUpdateOp`
- `delete` / `deleteOp`
- `restore` / `restoreOp`
- `hardDelete`
- `dangerouslyRemoveAllItems`
- `query`

`getAndUpdate` remains the portable read-modify-write operation. It reads the current Entity, computes a partial value, writes with an optimistic `_u` condition, and retries conflicts. Primary-key derivation fields, including the Entity id, are immutable through updates; moving an Entity is not an implicit update.

DynamoDB expression update remains adapter-native. It accepts the Entity definition and semantic key, migrates stale values before applying the expression, stamps `_u`, returns and broadcasts the decoded Entity, and rejects expressions that target key, index-derived, or metadata fields. DynamoDB `batchInsert` also remains adapter-native and chunks physical rows at the native 25-write limit; portable atomic insertion uses `insertOp` with `Table.transact`.

`queryStream` is not part of the initial portable surface. Its behavior will be designed separately.

Normal `delete` writes a tombstone. Portable reads return tombstoned Entities by default, including `_d` in Entity Meta, because deletion is sync data. Callers can request `excludeDeleted`. Hard deletion is portable but requires the explicit `I KNOW WHAT I AM DOING` confirmation. `dangerouslyRemoveAllItems` exists at both scopes: an Entity removes only its records, while a Table removes every physical record, including obsolete or unknown Entity kinds.

Transactions contain operations from one Table only, target each physical item at most once, and contain at most 100 operations. Every adapter enforces these rules before writing. All writes commit atomically or none do, and broadcasts occur only after a successful commit.

## Portable queries

Queries use an Entity access pattern, semantic partition-key fields, and exactly one sort-key condition:

```ts
const page =
  yield *
  people.query(
    'byCreatedAt',
    {
      pk: { organizationId },
      '>=': { createdAt: start },
    },
    {
      limit: 20,
      after,
      excludeDeleted: true,
    },
  );
```

The supported sort-key conditions are `=`, `<`, `<=`, `>`, `>=`, `between`, and `beginsWith`. Ordered comparisons accept `null` as an unbounded start in their direction. `<` and `<=` return descending results; the other conditions return ascending results. Composite sort keys are compared as one complete derived key, so the API does not allow independent per-field comparisons.

A query returns Entities and a `hasMore` flag. When `hasMore` is true, the page is non-empty and the caller resumes the same query by passing its last Entity as `after`. There is no public pagination token or adapter state.

The kernel derives a typed `QueryPosition` from `after`: the primary partition and sort key, plus the secondary-index sort key when required as a tie-break. Adapters translate that position into their native query mechanism. Passing an unrelated Entity is not an error; it acts as a range start.

The query limit defaults to 100 and counts returned Entities after exclusions. Adapters must continue reading internally through excluded tombstones. `hasMore` reports whether another Entity is reachable after the returned page.

## Errors

Portable operations fail with one outer `DatabaseError` tag. Its `reason` is a tagged union of expected database outcomes, configuration errors, and `OperationFailed`. Expected outcomes such as `ItemAlreadyExists`, `ConditionFailed`, and `NoItemToUpdate` remain separately matchable. Unexpected adapter failures use `OperationFailed`, which records the portable operation and retains the adapter failure as `cause`.

This keeps application error channels small while preserving precise recovery:

```ts
type ApplicationFailure = DatabaseError | ApiError | ApplicationError;
```

`StdToolkitError` becomes a type union of context-level toolkit errors rather than a shared base class. Adapter-native operations may continue to expose adapter-specific errors.

## Adapter-specific capabilities

Adapter setup and infrastructure are deliberately outside the portable surface. Creating or providing a layer never performs setup automatically.

- SQLite configured bindings expose an explicit setup Effect that creates the table and adds missing columns and indexes through the selected reusable database driver.
- IndexedDB configured adapters expose an explicit setup Effect that creates the Store and missing indexes through an auto-versioned database upgrade.
- DynamoDB configured adapters expose an explicit setup Effect that attempts `CreateTable` with their client and physical table name. It does not reconcile or migrate an existing table.
- `DynamoDB.getTableDefinition(table)` is a pure static projection that returns the AWS table topology without a physical table name, client, credentials, or Effect layer. Infrastructure code supplies its own name and deployment configuration.

Other native capabilities use explicit database namespaces. Code that uses one intentionally depends on that database and is not portable.

Read consistency also remains adapter-specific. DynamoDB primary-index and LSI reads can be strongly consistent, while GSI reads are always eventually consistent. SQLite and IndexedDB observe their latest committed state. The shared topology does not promise identical consistency strength; applications that require immediate secondary-index visibility must select a suitable adapter.

## Consequences

The three duplicated Entity stacks can be removed after local consumers migrate. Shared conformance tests will target the public portable contract and run the same scenarios against each Table runtime. Adapter tests will focus on physical translation, setup, infrastructure output, query positions, atomicity, and native extensions.

The design deliberately does not expose a public binding facade, name-based Entity registry, adapter-specific Entity wrapper, or mutable attachment API. A configured adapter owns physical configuration, while portable application code keeps the typed Table and Entity references returned at definition time.

ADR 0001 remains authoritative for buffered transaction operations, and ADR 0002 remains authoritative for portable get-and-update. This ADR supersedes ADR 0003 where that decision rejected local Table bindings or made physical names part of local Table definitions. Database-scoped reusable SQLite and IndexedDB runtimes remain valid.

## Rejected alternatives

- Keep three adapter-specific Table and Entity APIs: preserves duplication and allows semantic drift.
- Select one global adapter for all Tables: prevents applications from mixing DynamoDB, SQLite, and IndexedDB bindings.
- Resolve bindings by object identity: cannot express a distinct Table requirement reliably in TypeScript; unique logical names give both type-level and runtime identity.
- Add adapter-specific methods to portable Entity values through a layer: a layer cannot change the static type of an existing value, and doing so would distort the portable API around escape hatches.
- Expose DynamoDB pagination keys: leaks one adapter's physical protocol. Entity-based query resumption supports every portable sort-key condition without exposing adapter payloads.
- Hide tombstones by default: breaks the sync engine's deletion propagation.
- Preserve existing APIs and physical key encoding: adds transitional complexity without a production compatibility requirement.
