# db/idb — Ubiquitous Language

The in-browser IndexedDB adapter. Mirrors the single-table topology defined in [[db]] — **partition key**, **sort key**, **item collection**, `IndexDefinition`, **StdTable**, **entity surface** — over an IndexedDB object store. It is the browser sibling of [[sqlite]]: a sync-compatible local store, not a DynamoDB emulator. This glossary defines only where IndexedDB diverges from the shared kernel. See the root `CONTEXT-MAP.md`.

## Language

**IDB adapter table**:
The result of `IDB.make` (`IDBTable`): the IndexedDB implementation of the shared [[db]] **StdTable contract**. Its optional physical **Store** name defaults to the StdTable's logical name; the **partition key** and **sort key** together form the Store's composite key path.
_Avoid_: IndexedDB Table runtime (retired term), Table binding.

**Record**:
The adapter's **native item**: the physical representation of a **stored item** as a structured-clone object. It has `pk`, `sk`, `_e`, `_u`, `_d`, `_v`, and `data` at the top level. Secondary key properties use the attribute names declared by `IndexDefinition` without adapter-specific renaming.
_Avoid_: row, document.

**IndexedDB item schema**:
The adapter's **item schema**: one table-parameterized two-way Effect Schema between a **stored item** and an IndexedDB **Record** (`itemSchema(table): Schema<NativeItem, StoredItem>`). Writes run the decode direction, reads the encode direction, and malformed Records fail as parse errors. It performs no I/O.
_Avoid_: item codec, encodeItem/decodeItem pairs.

**Store**:
The real IndexedDB object store selected by `IDB.make(...)` for one StdTable. One database can hold multiple stores; the database is app-scoped and each store is table-scoped.
_Avoid_: logical name, alias, collection.

**Sparse index**:
A secondary index that simply skips **Records** missing its key fields — IndexedDB's native index behavior, matching DynamoDB's sparse-GSI semantics.

**IndexedDB read consistency**:
Primary, LSI, and GSI access patterns observe the latest committed IndexedDB state available to the transaction.

**Auto-versioned setup**:
The setup discipline where the adapter owns the database's version number, bumping it only when a declared **Store** or **Sparse index** is missing or incompatible, or a migration needs a version change. The upgrade creates additive topology but does not migrate legacy Records or backfill index keys on existing Records. A database name given to this adapter belongs to it; no other code may version that database.
_Avoid_: migration, manual upgrade.

**Stored snapshot**:
The table snapshot a **Store** keeps among its own **Records**, as the three internal entities of [[db]] (`__snapshot`, `__snapshot_entity`, `__snapshot_version`). Setup checks it on the table's first open, after creating a missing Store and before changing an existing Store's indexes, so a refused change leaves the Store as it was. The `_std_contract` store that held it before is deleted by the `2026-11-stored-contract` migration, which reserves that name.
_Avoid_: Contract store (retired term), metadata store.

**Backfill choice**:
What setup does with a change that needs a backfill on this adapter, the only one that backfills: reindex the stored **Records** in place, or wipe them. A **Persistent table** always reindexes; a **Disposable table** chooses, reindexing by default. A disposable Store whose Records cannot be reindexed is wiped instead.
_Avoid_: Migration, backfill job.

**Buffered transaction**:
The atomicity model for `transact()`: operations are validated into plain descriptors first, then applied together in one native IndexedDB transaction. There is no interactive begin/commit — IndexedDB transactions cannot span foreign async work.
_Avoid_: begin/commit/rollback, session.

**Optimistic update**:
The concurrency stance for read-modify-write: the write re-checks the **Record**'s `_u` inside the **Buffered transaction** and fails if another writer (e.g. a second browser tab) got there first. The caller retries.
_Avoid_: locking, last-write-wins.

IndexedDB failures are normalized into the shared [[db]] `DatabaseError` as an `OperationFailed` reason whose `cause` retains the browser error.
