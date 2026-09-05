# db/sqlite — Ubiquitous Language

The SQLite adapter. Mirrors the single-table topology defined in [[db]] — **partition key**, **sort key**, **item collection**, `IndexDefinition`, **StdTable**, **entity surface** — over a SQLite table. This glossary defines only where SQLite diverges from that shared kernel. See the root `CONTEXT-MAP.md`.

## Language

**SQLite adapter table**:
The result of `SQLite.make` (`SQLiteTable`): the SQLite implementation of the shared [[db]] **StdTable contract**. Its optional physical table name defaults to the StdTable's logical name; the **partition key** is the PRIMARY KEY column (TEXT), and the **sort key** is the RANGE column (TEXT).
_Avoid_: SQLite Table runtime (retired term), Table binding.

**SQLite row**:
The adapter's **native item**: the physical representation of an **encoded item**. The configured primary and secondary key attributes are `TEXT` columns; `_e`, `_u`, and `_d` are top-level metadata columns; `_v` is copied from the encoded value for storage; and `data` holds that encoded value. Secondary columns use the attribute names declared by `IndexDefinition` without adapter-specific renaming.

**SQLite item schema**:
The adapter's **item schema**: one table-parameterized two-way Effect Schema between an **encoded item** and a **SQLite row** (`itemSchema(table): Schema<NativeItem, EncodedItem>`). Writes run the decode direction, reads the encode direction, and malformed rows fail as parse errors. It performs no SQL construction or I/O.
_Avoid_: item codec, encodeItem/decodeItem pairs.

**SortKeyCondition**:
The range operators for querying within an **item collection** — `<`, `<=`, `>`, `>=`, `=`, `between`, `beginsWith` — paired with a pk value as `KeyConditionParameters`.

**SQLite read consistency**:
Primary, LSI, and GSI access patterns observe the latest committed SQLite state.

**driver**:
The platform binding implementing the `SQLiteDriver` interface beneath this adapter. Drivers target Node, better-sqlite3, Bun, or Cloudflare Durable Objects.
_Avoid_: adapter, backend, database runtime.

SQLite driver failures are normalized into the shared [[db]] `DatabaseError` as an `OperationFailed` reason whose `cause` retains the driver error.
