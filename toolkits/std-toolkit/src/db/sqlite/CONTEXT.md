# db/sqlite — Ubiquitous Language

The SQLite adapter. Mirrors the single-table topology defined in [[db]] — **partition key**, **sort key**, **item collection**, `IndexDefinition`, **StdTable**, **entity surface** — over a SQLite table. This glossary defines only where SQLite diverges from that shared kernel. See the root `CONTEXT-MAP.md`.

## Language

**SQLite adapter table**:
The result of `SQLite.make` (`SQLiteTable`): the SQLite implementation of the shared [[db]] **StdTable contract**. Its optional physical table name defaults to the StdTable's logical name; the **partition key** is the PRIMARY KEY column (TEXT), and the **sort key** is the RANGE column (TEXT).
_Avoid_: SQLite Table runtime (retired term), Table binding.

**SQLite row**:
The adapter's **native item**: the physical representation of a **stored item**. The configured primary and secondary key attributes are `TEXT` columns; `_e`, `_u`, and `_d` are top-level metadata columns, as is `_v`; and `data` holds the encoded value. Secondary columns use the attribute names declared by `IndexDefinition` without adapter-specific renaming.

**SQLite item schema**:
The adapter's **item schema**: one table-parameterized two-way Effect Schema between a **stored item** and a **SQLite row** (`itemSchema(table): Schema<NativeItem, StoredItem>`). Writes run the decode direction, reads the encode direction, and malformed rows fail as parse errors. It performs no SQL construction or I/O.
_Avoid_: item codec, encodeItem/decodeItem pairs.

**SortKeyCondition**:
The range operators for querying within an **item collection** — `<`, `<=`, `>`, `>=`, `=`, `between`, `beginsWith` — paired with a pk value as `KeyConditionParameters`.

**SQLite read consistency**:
Primary, LSI, and GSI access patterns observe the latest committed SQLite state.

**driver**:
The platform binding implementing the `SQLiteDriver` interface beneath this adapter. Drivers target Node, better-sqlite3, Bun, Cloudflare Durable Objects, or Cloudflare D1.
_Avoid_: adapter, backend, database runtime.

**SQLite setup**:
The SQLite **Adapter setup**, the same for every driver: it creates the physical table when it is missing, then runs the shared [[db]] setup over the adapter table's StdTable contract, so the **Stored contract** is reserved rows inside the table. Its topology creates the index columns and SQL indexes the new snapshot needs, replaces incompatible ones, and drops the ones it made for an index no longer declared; SQLite makes every index change in place, so it refuses nothing of its own. A wipe deletes every row and keeps the physical table. An existing table must already have the declared primary key, since SQLite cannot change one in place: a new primary key needs a new physical table name. A `_std_contract` table left by an earlier version is ignored.
_Avoid_: Contract table, metadata table, schema version table, migrations table.

SQLite driver failures are normalized into the shared [[db]] `DatabaseError` as an `OperationFailed` reason whose `cause` retains the driver error.
