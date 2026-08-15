# db — Ubiquitous Language

The home of the **StdTable**: the adapter-independent single-table abstraction. db defines the StdTable once — its definitions, entity semantics, and the **StdTable contract** — and each database **Adapter** ([[dynamodb]], [[sqlite]], idb) implements that contract directly. SQLite and IndexedDB mirror DynamoDB's topology, so the vocabulary is defined once here; each child context records only its own divergences. Adapters persist core [[core]] **Entities** whose `value` is validated by an eschema [[eschema]] schema. See the root `CONTEXT-MAP.md`.

## Language

**Single-table design**:
The pattern of storing many entity types in one physical table, distinguished by key structure rather than separate tables.
_Avoid_: multi-table, one-table-per-entity.

**StdTable**:
The adapter-independent single-table abstraction and aggregate of its entity surfaces, built with `StdTable.make`. It is an interface in the architectural sense: it defines what a table is and what every adapter must implement to realize one. Its logical name is unique within an application and is the type-level and Effect runtime identity for its layer. Entity surfaces may be added independently of when an adapter table is constructed; callers keep the typed references returned at definition time.
_Avoid_: Table (bare, for the abstraction), EntityRegistry, EntityManager, store registry, portable table.

**StdTable contract**:
The minimal storage obligation every adapter fulfills to make a StdTable complete: item-level reads, conditional puts, queries, atomic writes, hard deletes, and query positions over **encoded items** (`StdTableContract`). The kernel implements all StdTable surface semantics once, including generating Entity Meta `_u` with core `nextUlid`; adapters only translate storage primitives, physical values, query positions, atomic writes, and adapter failures. Adapters store the supplied `_u` and do not generate versions.
_Avoid_: Table runtime, runtime, port, binding, adapter Entity service, duplicated portable implementation.

**StdTable service**:
The typed Effect service, identified by a StdTable's unique logical name, through which operations reach the contract implementation (`StdTableService`). Providing an adapter table's layer satisfies it; every used StdTable requires its own layer in one Effect runtime.
_Avoid_: Table binding, attachment, mutable binding, global registration, object-identity binding.

**Adapter**:
A database implementation of the **StdTable contract**: DynamoDB, SQLite, IDB, or Memory (brand-faithful casing). Each adapter may also expose **adapter-native operations** beyond the contract. One adapter never imports another.
_Avoid_: backend, engine, database plugin.

**Driver**:
A platform binding beneath the SQLite adapter (node, bun, better-sqlite3, durable-object) implementing the `SQLiteDriver` interface. Drivers exist only where one adapter spans several runtimes; DynamoDB and IDB have none.
_Avoid_: database runtime, environment adapter.

**Adapter config**:
The adapter-specific information needed to reach a database, such as DynamoDB client settings, a SQLite driver and file, or an IndexedDB database name (`DynamoDBConfig`, `SQLiteConfig`, `IDBConfig`). Memory needs no adapter config. Adapter config is separate from the adapter-independent **StdTable** and its physical-name mapping.
_Avoid_: Adapter configuration (long form), table definition, shared database configuration.

**Adapter table**:
The result of `<Adapter>.make(stdTable, config)` — `DynamoDBTable`, `SQLiteTable`, `IDBTable` — or the config-free `Memory.make(stdTable)` result, `MemoryTable`: the StdTable realized on one database. It closes over one StdTable's physical configuration when the adapter has any and exposes its typed `layer` plus adapter-specific capabilities such as executable setup or an infrastructure definition.
_Avoid_: Configured adapter (retired term), instance, storage, public binding.

**Adapter setup**:
An adapter-specific, explicit preparation of a physical table or store through an **adapter table**. Its reconciliation and failure behavior belongs to the adapter, and creating or providing a layer never runs it automatically.
_Avoid_: Automatic setup, layer initialization.

**Encoded item**:
The portable form of one row as it crosses the **StdTable contract**: derived pk/sk, a `meta` block (`_e` entity discriminator, `_v` schema version, `_u` update ULID, `_d` tombstone flag), eschema-encoded `data`, and `keys` — derived secondary-index key strings flattened under their physical attribute names, an LSI contributing only its sort-key attribute (`EncodedItem`, with `EncodedKey` for a key pair alone). Everything about it is already encoded — values by eschema, keys by the key module — before an adapter sees it, and its flat layout mirrors the physical row so adapters translate value representations, not structure.
_Avoid_: StoredItem, stored item, row (for the portable form), indexes keyed by slot name.

**Decoded item**:
An adapter's concrete native shape for one row — a DynamoDB attribute-value record, a SQLite row, an IndexedDB stored object. Each adapter's **item schema** decodes an encoded item into it and encodes it back.
_Avoid_: WireItem, physical item, raw row.

**Item schema**:
The single two-way Effect Schema each adapter defines between the portable and native forms: `Schema<DecodedItem, EncodedItem>`, constructed per table definition. Writes run the decode direction, reads the encode direction; shape validation is the schema itself, and malformed rows fail as parse errors, not thrown strings.
_Avoid_: item codec, encodeItem/decodeItem pairs, manual shape checks.

**Conditional put**:
The one write shape in the **StdTable contract**: a full **encoded item**, optionally guarded by a `PutCondition` (`not-exists` for inserts, a version match for optimistic concurrency). Adapters never merge — they only put whole items.
_Avoid_: WriteRequest, partial update (at the contract), upsert.

**Topology compatibility baseline**:
The DynamoDB-compatible structural limits enforced by every **StdTable**, so each logical definition can be implemented by DynamoDB, SQLite, IndexedDB, or Memory. Limits that depend on physical runtime state remain adapter-specific checks.
_Avoid_: Adapter-unbounded topology.

**Partition key (pk)**:
The distribution key. All rows sharing a pk value live together as one **item collection**.
_Avoid_: hash key (within this context use **partition key**). Note: unrelated to tanstack-sync's **Partition** lifecycle concept — see the root map's collision note.

**Item collection**:
The set of rows sharing one **partition key** value — i.e. a single **partition** in the storage sense. The unit a query over a pk returns.
_Avoid_: partition (prefer **item collection** when naming the row set; reserve "partition" for the concept).

**Sort key (sk)**:
The ordering key within an **item collection**. Enables range queries (`<`, `<=`, `>`, `>=`, `=`, `between`, `beginsWith`) over a partition.
_Avoid_: range key (within this context use **sort key**).

**IndexDefinition**:
The explicit structure naming the pk and sk attributes or columns for an index. The toolkit does not derive these names from the index slot name.

**LSI** / **GSI**:
A **Local Secondary Index** shares the primary index's partition key and declares a different sort key; a **Global Secondary Index** declares an independent partition key and sort key. Their names identify generic physical index slots such as `LSI1` and `GSI1`, not application-specific access patterns.
_Avoid_: Local index, global index, mobile secondary index.

**Read consistency**:
The visibility guarantee supplied by an **adapter table**. The shared LSI/GSI topology does not make all adapters equally consistent; applications that require immediate secondary-index visibility must select an adapter that provides it.
_Avoid_: Portable consistency guarantee.

**Access pattern**:
An entity-scoped, application-specific query route such as `byEmail`, mapped onto a generic **LSI** or **GSI** slot.
_Avoid_: Physical index name, index slot.

**Index component**:
An ESchema-encoded string field used to derive a physical key for an **access pattern**. Composite components use a collision-safe encoding; number, boolean, object, and array fields cannot be index components.
_Avoid_: String-coerced field, delimiter-joined key.

**Entity surface**:
The per-entity CRUD surface defined once from a **StdTable** (`KeyedEntity`, `SingleEntity`). An adapter table's layer supplies its contract implementation without changing this surface. Every operation on it returns a `TableEffect` — an Effect that can fail with `DatabaseError` and runs only once its StdTable's layer is provided.
_Avoid_: Entity service (retired term), adapter-specific Entity wrappers, PortableKeyedEntity.

**Portable value**:
An ESchema-encoded JSON-compatible value accepted by every adapter: null, boolean, number, string, arrays, and objects composed from the same values. Adapter-native value types are outside the **StdTable surface**.
_Avoid_: Structured-clone value, DynamoDB-native value.

**StdTable surface**:
The adapter-independent storage API whose operations have equivalent observable semantics across every supported database. Adapter-native capabilities are extensions outside it. "Portable" remains the adjective for the property — portable operations, portable values — while StdTable names the thing.
_Avoid_: Portable surface (retired term), common API, compatible signatures.

**Tombstone visibility**:
StdTable `get` and `query` operations return tombstoned Entities by default, including the `_d` field in **Entity Meta**, because deletion is sync data. Callers must set `excludeDeleted` to hide them.
_Avoid_: Hidden tombstones, includeDeleted.

**Hard deletion**:
The portable, irreversible removal of one Entity or all items for an **entity surface**. `hardDelete` and `dangerouslyRemoveAllItems` require the explicit `I KNOW WHAT I AM DOING` confirmation; normal `delete` writes a tombstone.
_Avoid_: Delete (use for tombstoning).

**Adapter-native operation**:
An explicit adapter-specific escape hatch that is not part of the **StdTable surface**, such as DynamoDB expression update or batch insert. Code that uses one requires that adapter and cannot be moved unchanged to another database.
_Avoid_: Portable extension, enhanced common operation.

**DatabaseError**:
The outer tagged error for the **StdTable surface**. Its typed `reason` identifies the precise database failure, while an optional `cause` retains adapter-specific diagnostic information; it is one member of the core [[core]] `StdToolkitError` union.
_Avoid_: Flat adapter error union, database error base class.

**OperationFailed**:
The `DatabaseError` reason for an unexpected adapter failure. It identifies the operation that failed and retains the adapter failure as its `cause`; expected outcomes such as `ItemAlreadyExists` and `ConditionFailed` remain distinct reasons.
_Avoid_: GetFailed, QueryFailed, InsertFailed, adapter operation error unions.

**QueryPage**:
The adapter-independent output of an **access pattern** query: the returned Entities and a `hasMore` flag. The limit defaults to 100 and counts Entities after requested exclusions; `hasMore: true` guarantees the page is non-empty, so the next page is always reachable via **query resumption**.
_Avoid_: QueryResult (retired term), continuation (retired term), queryStream (excluded until its portable behavior is designed).

**Query resumption**:
Continuing a query by passing the last returned Entity as the `after` option of the same query. The kernel derives the exact storage position — primary key plus, for secondary-index queries, the index sort key as the tie-break — and hands adapters a typed `startAfter` position (`QueryPosition`); there is no opaque token and no adapter cursor state. Resuming a different query with an unrelated Entity is not an error; it acts as a range start.
_Avoid_: Query continuation (retired term), ExclusiveStartKey, LastEvaluatedKey, cursor, opaque pagination token.

**Sort-key condition**:
The single `=`, `<`, `<=`, `>`, `>=`, `between`, or `beginsWith` condition in an **access pattern** query. Its operand is the semantic value from which the physical **sort key** is derived; `null` on an ordered comparison means unbounded in that operator's direction. `<` and `<=` return descending results; all other conditions return ascending results.
_Avoid_: Cursor, pagination token, per-field comparison.

**Get-and-update**:
The portable read-modify-write on an **entity surface** (`getAndUpdate` / `getAndUpdateOp`): read the current entity, derive a partial from it (plain partial or `current => partial` callback), and write back guarded on the `_u` that was read. The guarded, retrying counterpart to adapter-native update surfaces.
_Avoid_: getUpdate, modify, RMW (spell out **get-and-update**).

**Transact op**:
A deferred write produced by an **entity surface** ahead of any transaction (`TransactOp`) — `insertOp`, `getAndUpdateOp`, `deleteOp`, or `restoreOp`. Building an op validates, encodes, and captures the optimistic-concurrency expectation; it performs no write until **transact** supplies the `_u` assigned at commit time.
_Avoid_: PortableTransactionOp.

**Reset (single entity)**:
Single entities are never deleted — `reset()` writes the default value back as a real record, so `get` and broadcasts agree on the same `_u`.
_Avoid_: delete (retired single-entity term).

**Transact**:
The **StdTable**'s atomic application of at most 100 **transact ops** — all apply or none do. The shared limit follows the DynamoDB compatibility baseline and is enforced by every adapter before writing. Change broadcasts fire only after a successful commit. This is the only transaction vocabulary in the kernel; adapters do not expose interactive (read-inside) transactions.
_Avoid_: transaction(effect) (retired sqlite term), interactive transaction.

**Foreign transact op**:
A **transact op** submitted to a different **StdTable** from the one whose **entity surface** produced it. The batch is rejected before writing.

**Duplicate transaction target**:
Two or more **transact ops** in one batch that address the same **partition key** and **sort key**. The batch is rejected before writing.

**Parity story**:
An executable story whose proof runs one program against every **Adapter** through the parity harness and asserts identical results. Parity stories prove the **StdTable surface**; they never showcase a single adapter.
_Avoid_: cross-adapter test, shared story.

**Adapter-native story**:
An executable story that showcases one **Adapter**'s native capability — an **adapter-native operation**, or behavior only that database exhibits, such as IndexedDB's auto-versioned setup or the SQLite driver seam. Its answer must state why the capability is not portable; a capability every adapter could honor belongs in the **StdTable surface** and a **parity story** instead.
_Avoid_: adapter-specific story, divergence test.
