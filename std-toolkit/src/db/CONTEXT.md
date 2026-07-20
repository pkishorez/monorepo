# db — Ubiquitous Language

The storage kernel shared by the database adapters. db is the **Shared Kernel** between [[dynamodb]] and [[sqlite]]: it defines the single-table topology both adapters implement. SQLite mirrors DynamoDB's topology, so the vocabulary is defined once here; each child context (dynamodb, sqlite) records only its own divergences. Adapters persist core [[core]] **Entities** whose `value` is validated by an eschema [[eschema]] schema. See the root `CONTEXT-MAP.md`.

## Language

**Single-table design**:
The pattern of storing many entity types in one physical table, distinguished by key structure rather than separate tables.
_Avoid_: multi-table, one-table-per-entity.

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
The structure naming the pk and sk attributes/columns for an index.

**Table**:
The single-table topology object. **Entity services** are defined from it and it coordinates cross-entity concerns (setup, transactions). Holds its entities internally; there is no name-based entity lookup — callers keep the references returned at definition time.
_Avoid_: EntityRegistry (retired term — the Table absorbed its role), EntityManager, store registry.

**Entity service**:
The per-entity CRUD surface over the table — `DynamoEntity` / `SQLiteEntity` for keyed entities, `DynamoSingleEntity` / `SQLiteSingleEntity` for singletons. Each adapter names its own pair.

**QueryResult**:
The output of a query/scan over an **item collection** — the returned `Items`, plus adapter-specific pagination (e.g. DynamoDB's `LastEvaluatedKey`).

**Get-and-update**:
The portable read-modify-write on an **entity service** (`getAndUpdate` / `getAndUpdateOp`): read the current entity, derive a partial from it (plain partial or `current => partial` callback), and write back guarded on the `_u` that was read. The guarded, retrying counterpart to adapter-native update surfaces.
_Avoid_: getUpdate, modify, RMW (spell out **get-and-update**).

**Transact op**:
A deferred write (insert, update, delete, or restore) produced by an **entity service** ahead of any transaction — `insertOp` / `getAndUpdateOp` (DynamoDB also keeps a native `updateOp`) / `deleteOp` (tombstones via `_d: true`) / `restoreOp` (`_d: false`). Building an op validates, encodes, and captures the optimistic-concurrency expectation (the update/delete/restore ops can drop it with `lastWriteWins: true`); it performs no write and has no executable form until **transact** supplies the write cursor — the op is a pure function of the `_u` assigned at commit time.

**Reset (single entity)**:
Single entities are never deleted — `reset()` writes the default value back as a real record, so `get` and broadcasts agree on the same `_u`.
_Avoid_: delete (retired single-entity term).

**Transact**:
The **Table**'s atomic application of a batch of **transact ops** — all apply or none do. Change broadcasts fire only after a successful commit. This is the only transaction vocabulary in the kernel; adapters do not expose interactive (read-inside) transactions.
_Avoid_: transaction(effect) (retired sqlite term), interactive transaction.
