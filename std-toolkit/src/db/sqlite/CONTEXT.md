# db/sqlite — Ubiquitous Language

The SQLite adapter. Mirrors the single-table topology defined in [[db]] — **partition key**, **sort key**, **item collection**, `IndexDefinition`, **Table**, **Entity service** — over a SQLite table. This glossary defines only where SQLite diverges from that shared kernel. See the root `CONTEXT-MAP.md`.

## Language

**SQLiteTable**:
A type-safe single-table definition. The **partition key** is the PRIMARY KEY column (TEXT), the **sort key** is the RANGE column (TEXT).

**SQLiteEntity** / **SQLiteSingleEntity**:
The SQLite **Entity service**s (keyed / singleton) for CRUD over a `SQLiteTable`.

**`_data` column**:
The TEXT column holding the JSON-serialized **Entity** `value`. SQLite's storage form of the domain data (DynamoDB instead stores attributes natively).
_Avoid_: payload column, blob.

**SortKeyCondition**:
The range operators for querying within an **item collection** — `<`, `<=`, `>`, `>=`, `=`, `between`, `beginsWith` — paired with a pk value as `KeyConditionParameters`.

**adapter** / **runtime adapter**:
The environment-specific SQLite binding behind the service. Each **runtime adapter** targets one JS runtime: `node` (async) and `better-sqlite3` (sync) for Node, `bun` for Bun, `do` for Cloudflare Durable Objects.
_Avoid_: driver, backend.

**SqliteDB** / **SqliteDBError**:
The database abstraction the adapters implement, and its failure type (extends core's [[core]] **StdToolkitError**).
