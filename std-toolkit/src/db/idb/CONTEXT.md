# db/idb — Ubiquitous Language

The in-browser IndexedDB adapter. Mirrors the single-table topology defined in [[db]] — **partition key**, **sort key**, **item collection**, `IndexDefinition`, `EntityRegistry`, **Entity service** — over an IndexedDB object store. It is the browser sibling of [[sqlite]]: a sync-compatible local store, not a DynamoDB emulator. This glossary defines only where IndexedDB diverges from the shared kernel. See the root `CONTEXT-MAP.md`.

## Language

**IdbTable**:
A type-safe single-table definition over one object store. The **partition key** and **sort key** together form the store's composite key path.

**IdbEntity** / **IdbSingleEntity**:
The IndexedDB **Entity service**s (keyed / singleton) for CRUD over an `IdbTable`.

**Record**:
The stored row — a native structured-clone object whose `_data` field holds the **Entity** `value` as a real object (SQLite instead serializes it to a `_data` TEXT column).
_Avoid_: row, document.

**Store**:
The IndexedDB object store backing one logical table. One database holds one store per table; the database is app-scoped, the store is table-scoped.
_Avoid_: table (reserve for the logical single-table concept), collection.

**Sparse index**:
A secondary index that simply skips **Records** missing its key fields — IndexedDB's native index behavior, matching DynamoDB's sparse-GSI semantics.

**Auto-versioned setup**:
The setup discipline where the adapter owns the database's version number, bumping it only when a declared **Store** or **Sparse index** is missing. A database name given to this adapter belongs to it; no other code may version that database.
_Avoid_: migration, manual upgrade.

**Buffered transaction**:
The atomicity model for `transact()`: operations are validated into plain descriptors first, then applied together in one native IndexedDB transaction. There is no interactive begin/commit — IndexedDB transactions cannot span foreign async work.
_Avoid_: begin/commit/rollback, session.

**Optimistic update**:
The concurrency stance for read-modify-write: the write re-checks the **Record**'s `_u` inside the **Buffered transaction** and fails if another writer (e.g. a second browser tab) got there first. The caller retries.
_Avoid_: locking, last-write-wins.

**IdbDB** / **IdbDBError**:
The database service the table layer runs on, and its failure type (extends core's [[core]] **StdToolkitError**).
