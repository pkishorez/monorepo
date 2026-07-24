# std-toolkit/sqlite

SQLite table and entity services built on Effect, with runtime adapters for multiple environments.

## Subpaths

```ts
import { SQLiteTable, SqliteDB } from 'std-toolkit/sqlite';
import { ... } from 'std-toolkit/sqlite/adapters/better-sqlite3'; // Node.js (sync)
import { ... } from 'std-toolkit/sqlite/adapters/node';           // Node.js (async)
import { ... } from 'std-toolkit/sqlite/adapters/bun';            // Bun runtime
import { ... } from 'std-toolkit/sqlite/adapters/do';             // Cloudflare Durable Objects
```

## Key exports

**Services**

- `SQLiteTable` — the single-table topology; entities are defined from it via `table.entity(eschema)` / `table.singleEntity(eschema)` and it coordinates `setup()` and `transact()`
- `table.snapshot()` — synchronously captures the table's logical topology, registered entities, ESchema histories, and index derivations without connecting to SQLite. See the [shared snapshot workflow](../../eschema/README.md#semantic-contract-snapshots).

**Transactions**

- `table.transact(ops)` takes op descriptors produced by `entity.insertOp(...)` / `entity.getAndUpdateOp(...)` / `entity.deleteOp(...)` / `entity.restoreOp(...)` / `singleEntity.getAndUpdateOp(...)` — which validate, migrate, and derive keys up front — and applies them all in one database transaction. Each op re-checks its condition inside the transaction (`insert`: row must not exist; `update`: stored `_u` must equal the op's `expectedU`, unless built with `lastWriteWins: true`); any violation rolls the whole batch back with `conditionFailed`. Ops from an entity of a different table are rejected at runtime. Broadcasts fire only after commit, in op order. See `src/db/docs/adr/0001-buffered-transact-ops-only.md` for why this is the only transaction model.

**Database**

- `SqliteDB` — database abstraction layer
- `SqliteDBError` — error type for database failures

## Adapters

Each adapter subpath exports a driver that wires the environment-specific SQLite binding into `SqliteDB`. Install only the adapter you use — each is a separate subpath to avoid bundling unused bindings.
