# db — Ubiquitous Language

The home of the **StdTable**: the adapter-independent single-table abstraction. db defines the StdTable once — its definitions, entity semantics, and the **StdTable contract** — and each database **Adapter** ([[dynamodb]], [[sqlite]], idb) implements that contract directly. SQLite and IndexedDB mirror DynamoDB's topology, so the vocabulary is defined once here; each child context records only its own divergences. Adapters persist core [[core]] **Entities** whose `value` is validated by an eschema [[eschema]] schema. See the root `CONTEXT-MAP.md`.

## Language

**Single-table design**:
The pattern of storing many entity types in one physical table, distinguished by key structure rather than separate tables.
_Avoid_: multi-table, one-table-per-entity.

**StdTable**:
The adapter-independent single-table abstraction and aggregate of its entity surfaces, built with `StdTable.make`. It is an interface in the architectural sense: it defines what a table is and what every adapter must implement to realize one. Its logical name is unique within an application and is the type-level and Effect runtime identity for its layer. It is one declaration, in order: keys and indexes, then its entities; the built table carries each **Entity surface** under its ESchema name (`board.Task`), and an entity name is declared once per table. It also exposes table-wide `subscribe`, returning a `Stream` of core [[core]] **Change Notice**s across every entity broadcasting through the same Broadcaster — untyped, since no single entity schema applies, and not narrowed to this table's own entities (Entity Meta carries no table identity). Entity- or value-scoped subscription belongs to the **Entity surface** instead.
_Avoid_: Table (bare, for the abstraction), EntityRegistry, EntityManager, store registry, portable table.

**StdTable contract**:
The minimal storage obligation every adapter fulfills to make a StdTable complete: item-level reads, conditional puts, **item checks**, queries, atomic writes, hard deletes, and query positions over **stored items** (`StdTableContract`). The kernel implements all StdTable surface semantics once, including generating Entity Meta `_u` with core `nextUlid`; adapters only translate storage primitives, physical values, query positions, atomic writes, and adapter failures. Adapters store the supplied `_u` and do not generate versions.
_Avoid_: Table runtime, runtime, port, binding, adapter Entity service, duplicated portable implementation.

**StdTable service**:
The typed Effect service, identified by a StdTable's unique logical name, through which operations reach the contract implementation (`StdTableService`). Providing an adapter table's layer satisfies it; every used StdTable requires its own layer in one Effect runtime.
_Avoid_: Table binding, attachment, mutable binding, global registration, object-identity binding.

**Adapter**:
A database implementation of the **StdTable contract**: DynamoDB, SQLite, IDB, or Memory (brand-faithful casing). Each adapter may also expose **adapter-native operations** beyond the contract. One adapter never imports another.
_Avoid_: backend, engine, database plugin.

**Driver**:
A platform binding beneath the SQLite adapter (node, bun, better-sqlite3, durable-object, d1) implementing the `SQLiteDriver` interface. Drivers exist only where one adapter spans several runtimes; DynamoDB and IDB have none.
_Avoid_: database runtime, environment adapter.

**Adapter config**:
The adapter-specific information needed to reach a database, such as DynamoDB client settings, a SQLite driver and file, or an IndexedDB database name (`DynamoDBConfig`, `SQLiteConfig`, `IDBConfig`). Memory needs no adapter config. Adapter config is separate from the adapter-independent **StdTable** and its physical-name mapping.
_Avoid_: Adapter configuration (long form), table definition, shared database configuration.

**Adapter table**:
The result of `<Adapter>.make(stdTable, config)` — `DynamoDBTable`, `SQLiteTable`, `IDBTable` — or the config-free `Memory.make(stdTable)` result, `MemoryTable`: the StdTable realized on one database. It closes over one StdTable's physical configuration when the adapter has any and exposes its typed `layer`. It never prepares the physical table; that is **Adapter setup**.
_Avoid_: Configured adapter (retired term), instance, storage, public binding.

**Adapter setup**:
The adapter-native step that prepares one physical table under its **Table mode**: it compares the current table snapshot with the **Stored contract**, then refuses (a **Persistent table**) or wipes the whole table (a **Disposable table**) on a change that is not safe, applies the topology, and records the new Stored contract. Its options are the adapter's own; IndexedDB changes its indexes in a version upgrade between the plan and the reindex. SQLite runs the shared setup for every driver: it creates a missing table, keeps the Stored contract as reserved rows inside it, and reindexes the rows an index change touches. It runs where nothing per request pays for it: at deploy inside an Alchemy resource (D1 and DynamoDB, with no deploy guard), at runtime start (SQLite files, IndexedDB on app open), or on an object's first access (Durable Objects). DynamoDB runs the shared setup too: it creates a missing table, adds a new global secondary index in place before the reindex, and refuses every other index change in either mode, since DynamoDB makes it only by replacing the table. Memory has none and takes no mode, since nothing outlives it. It is separate from `make`.
_Avoid_: Automatic setup, layer initialization, verifySnapshot.

**Table mode**:
Whether one physical table is a **Persistent table** or a **Disposable table**, declared for each physical table rather than on the StdTable, since one StdTable may be persistent on a server and disposable in a browser. A disposable table may become persistent; a persistent table never becomes disposable, so that change is an error, and the only way past it is a new physical table name.
_Avoid_: Durability, retention, storage class.

**Persistent table**:
A physical table whose data must never be lost or stranded by a schema change. A breaking or unverifiable change to it is refused before it reaches the data, with no override, and a failed setup never wipes it. An index change is reindexed by setup before the table opens, with nothing declared. A change no pure migration can make goes to a new table through a **Table migration**. Any adapter may hold one, the browser included.
_Avoid_: Durable table (collides with Durable Objects), server table, production table.

**Disposable table**:
A physical table whose data may be thrown away when a schema change is not safe, such as preferences or a local copy that can be fetched again. It is still stored; it is only disposable. A disposable table is not frozen by version history: its schemas may change freely. It never runs a **Table migration**:
The one-time move of every row of an old **StdTable** into a new one, on a new physical table, for a change no pure **migration** can make (`StdTable.migrate(old, next, handlers)`). It has one handler per entity of the old table, and the keys are exhaustive. A handler gets one old row at its latest value, reads the old table, and writes any number of rows to the new one. It returns a `Stream` of progress events and keeps one migration row in the new table's **Stored contract**. That row says `running` until every row is through and `done` after, so a finished migration is a no-op, and a crashed or failed one clears the new table and starts over. It runs wherever it is called: at deploy in an Alchemy migration resource, or at app open on a device. Once every database has migrated, the old table and the call are deleted. The new table's ESchemas start again at v1 and do not know the old table.
_Avoid_: Backfill (retired), data migration, table step, copy.

**Entity key**:
The logical identity accepted by a keyed **entity surface**: the entity's primary partition components plus its ESchema id field. It is derived into the physical partition and sort keys internally rather than exposing those physical values to callers.
_Avoid_: Physical key, encoded key, pk/sk pair.

**Entity key immutability**:
Fields composing an **entity key** cannot change during an update. Moving a value to a different identity is an explicit delete followed by an insert.

**Portable value**:
A JSON-compatible value in eschema **encoded form**, accepted by every adapter: null, boolean, number, string, arrays, and objects composed from the same values. Adapter-native value types are outside the **StdTable surface**.
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
An adapter-specific function outside the **StdTable surface**. Only table provisioning and inspection remain: `SQLite.setup`, `IDB.setup`, `IDB.database`, and `DynamoDB.setup`, `createTable`, `deleteTable` and `getTableDefinition`. No adapter offers native reads or writes; every read and write goes through the **StdTable surface**, which is the only place values are encoded and decoded. Code that uses one requires that adapter and cannot be moved unchanged to another database.
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
The portable read-modify-write on an **entity surface** (`getAndUpdate` / `getAndUpdateOp`): read the current entity, derive a partial from it, and write the merged record back guarded on the `_u` that was read. The update is a partial or a `current => partial` callback — never one returning `null`, which is not a vetoing vocabulary; a rule that declines the write is an **entity invariant**, passed as the `check` option. `check` and `lastWriteWins` are mutually exclusive and the types enforce it: an invariant judges the value **transact** read, and only the `_u` **item condition** still holds that value at the moment of the write. `getAndUpdate` performs its own read and retries; `getAndUpdateOp` performs no read, and the read happens inside **transact**.
_Avoid_: getUpdate, modify, RMW (spell out **get-and-update**), null veto.

**Get-and-check**:
The keyed-entity **check op** carrying an **entity invariant** (`getAndCheckOp`): at commit time **transact** reads the current, non-tombstoned entity, applies the invariant to its domain value, and guards that value's `_u`. Building the op reads nothing. An absent or tombstoned entity is `NoItemToCheck`, while a refused value is `CheckRefused`.
_Avoid_: getAndAssert, single-entity get-and-check.

**Entity invariant**:
A caller-supplied predicate over an **entity**'s **value**, evaluated in process by **transact** against the value it reads at commit time (`check`). It rides on a writing **transact op** — `getAndUpdateOp`, `deleteOp`, `restoreOp` — or stands alone as `getAndCheckOp`. It exists because the **duplicate transaction target** rule forbids a separate **check op** on an item the batch writes, so a rule about an item you are writing has nowhere else to live. Unlike an **item condition** it never reaches the database and is never portable to a DynamoDB condition expression; that is the point — arbitrary JavaScript stays in JavaScript. A refused invariant fails the batch before anything is submitted.
_Avoid_: condition, predicate, guard, business rule, check condition.

**Transact op**:
A statement of intent, produced by an **entity surface** ahead of any transaction (`TransactOp`) — `insertOp`, `getAndUpdateOp`, `deleteOp`, `restoreOp`, or a **check op**. An op reads nothing: it validates what the caller supplied and writes it in encoded form, and nothing more. Every op answers one uniform request — given the item **transact** read and the commit `_u`, produce the write — which the **entity surface** fulfils through a single match over the op kinds, so **transact** never branches on what an op is. A writing op always produces exactly one write, even when it rewrites a value that already holds: one write per op is what keeps a batch atomic and keeps a **transact outcome** aligned with the op at its position. Holding an op is therefore free of staleness — the interval between building an op and committing it does not widen the window an **item condition** must survive.
_Avoid_: PortableTransactionOp, deferred write (a check op writes nothing), prepared op.

**Check op**:
The non-writing **transact op** kind: an assertion about one item that must hold for the batch to commit, expressed in the same vocabulary as a **conditional put** — the item is unchanged since a known `_u`, exists, or does not exist. It contributes nothing to write and yields `null` in the **transact** result at its position, so results stay positionally aligned with the ops given. Entity surfaces build them from an entity or key alone — `unchangedOp`, `existsOp`, `notExistsOp` — or from an **entity invariant** over a value **transact** reads at commit time (`getAndCheckOp`); a single entity offers `unchangedOp` only.
_Avoid_: ConditionCheck (in the StdTable surface), assertion, precondition, guard op.

**Reset (single entity)**:
Single entities are never deleted — `reset()` writes the default value back as a real record, so `get` and broadcasts agree on the same `_u`.
_Avoid_: delete (retired single-entity term).

**Transact**:
The **StdTable**'s atomic application of at most 100 **transact ops** — all apply or none do. Transact owns every read the batch needs: it validates the ops, reads the current items consistently and concurrently under a bounded number in flight, asks each op for its write, and submits them. The same read-apply-write story runs at arity one behind `insert`, `getAndUpdate`, `delete`, and `restore`, which differ from transact only in sending one **conditional put** instead of a batch — the validation, encoded-form conversion, merging, and **entity invariant** work is one implementation shared by both. A batch may be **check ops** only, asserting a set of facts together without writing. The shared limit follows the DynamoDB compatibility baseline and is enforced by every adapter before writing. Transact never retries — a caller reads the **transact outcome** statuses and decides. Change broadcasts fire only after a successful commit. This is the only transaction vocabulary in the kernel; adapters do not expose interactive (read-inside) transactions.
_Avoid_: transaction(effect) (retired sqlite term), interactive transaction.

**Foreign transact op**:
A **transact op** submitted to a different **StdTable** from the one whose **entity surface** produced it. The batch is rejected before writing.

**Duplicate transaction target**:
Two or more **transact ops** in one batch that address the same **partition key** and **sort key**, including a **check op** on an item another op writes. The batch is rejected before writing. The guard is a portability guarantee rather than a correctness one: DynamoDB rejects a repeated target outright while the other adapters would apply both silently, so without it the same program would commit on three adapters and fail on one. Guard an item you write through that write's own **item condition**.

**Transact outcome**:
The per-operation account a failed **transact** returns (`TransactFailed`, carrying one `TransactOutcome` per submitted op, in order): the entity, its key, the operation kind, the op itself, and a status of `passed`, `stale`, `refused`, `missing`, or `not-evaluated`. No status is ever "success" — a failed transact writes nothing, and `passed` means only that an op's condition held. The three failure statuses each imply a different caller action: `stale` (the `_u` moved) may succeed on a retry, `refused` (an **entity invariant** said no) never will, and `missing` (`NoItemToUpdate`, `NoItemToCheck`, `ItemAlreadyExists`) says the keys are wrong. `not-evaluated` is a real divergence rather than a gap: DynamoDB evaluates every item and may report several failures at once, while SQLite, IDB, and Memory stop at the first, so everything after it was never checked. When an op refuses before the batch is submitted, every other op is `not-evaluated`, those before it included: their **item conditions** are only checked on submission. `ConditionFailed` remains the reason for single-item writes, where one condition needs no report.
_Avoid_: success/ok status, generic `failed` status, failing index, cancellation reasons (adapter term).

**Parity story**:
An executable story whose proof runs one program against every **Adapter** through the parity harness and asserts identical results. Parity stories prove the **StdTable surface**; they never showcase a single adapter.
_Avoid_: cross-adapter test, shared story.

**Adapter-native story**:
An executable story that showcases one **Adapter**'s native capability — an **adapter-native operation**, or behavior only that database exhibits, such as IndexedDB's auto-versioned setup or the SQLite driver seam. Its answer must state why the capability is not portable; a capability every adapter could honor belongs in the **StdTable surface** and a **parity story** instead.
_Avoid_: adapter-specific story, divergence test.
