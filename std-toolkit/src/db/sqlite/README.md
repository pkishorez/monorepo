# std-toolkit/sqlite

SQLite table and entity services built on Effect, with runtime adapters for multiple environments.

## Subpaths

```ts
import { SQLiteTable, SQLiteEntity, SqliteDB } from 'std-toolkit/sqlite';
import { ... } from 'std-toolkit/sqlite/adapters/better-sqlite3'; // Node.js (sync)
import { ... } from 'std-toolkit/sqlite/adapters/node';           // Node.js (async)
import { ... } from 'std-toolkit/sqlite/adapters/bun';            // Bun runtime
import { ... } from 'std-toolkit/sqlite/adapters/do';             // Cloudflare Durable Objects
```

## Key exports

**Services**

- `SQLiteTable`, `SQLiteEntity`, `SQLiteSingleEntity` — Effect services for table operations
- `EntityRegistry` — registry of all entities in a table

**Database**

- `SqliteDB` — database abstraction layer
- `SqliteDBError` — error type for database failures

## Adapters

Each adapter subpath exports a driver that wires the environment-specific SQLite binding into `SqliteDB`. Install only the adapter you use — each is a separate subpath to avoid bundling unused bindings.
