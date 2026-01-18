# db-sqlite

SQLite adapter for std-toolkit with single table design patterns, built with Effect.

## Prerequisites

- [Effect](https://effect.website) - The TypeScript library for building robust applications
- [@std-toolkit/eschema](../eschema) - Evolving schema with versioning

## Getting Started

### 1. Define your schema

```typescript
import { ESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

const UserSchema = ESchema.make("User", {
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  status: Schema.Literal("active", "inactive"),
}).build();
```

### 2. Create a table

```typescript
import { SQLiteTable } from "@std-toolkit/sqlite/table";

const UsersTable = SQLiteTable.make(UserSchema)
  .primary(["id"])
  .index("byEmail", ["email"])
  .index("byStatus", ["status", "_u"]) // _u is the updated_at meta field
  .build();
```

### 3. Provide a database layer

```typescript
import Database from "better-sqlite3";
import { SqliteDBBetterSqlite3 } from "@std-toolkit/sqlite/adapters/better-sqlite3";

const db = new Database("data.db");
const layer = SqliteDBBetterSqlite3(db);
```

### 4. Use it

```typescript
import { Effect } from "effect";

const program = Effect.gen(function* () {
  yield* UsersTable.setup();

  yield* UsersTable.insert({
    id: "user-1",
    email: "alice@example.com",
    name: "Alice",
    status: "active",
  });

  const user = yield* UsersTable.get({ id: "user-1" });
  console.log(user.data.name); // "Alice"
});

Effect.runPromise(program.pipe(Effect.provide(layer)));
```

## Operations

| Operation | Description |
|-----------|-------------|
| `setup()` | Create table and indexes (idempotent) |
| `insert(entity)` | Insert a new row |
| `update(key, updates)` | Update an existing row |
| `delete(key)` | Soft-delete a row (sets `_d` flag) |
| `get(key)` | Get a single row by primary key |
| `query(index, op, options?)` | Query rows by index with range operators |
| `dangerouslyRemoveAllRows(confirm)` | Hard-delete all rows |

---

### get

Fetch a single entity by primary key.

```typescript
const result = yield* UsersTable.get({ id: "user-1" });
// result.data - the entity
// result.meta - { _v, _i, _u, _c, _d } metadata
```

Fails with `SqliteDBError` if not found.

---

### query

Query entities using range operators on primary key or indexes.

```typescript
// Query by primary key
const result = yield* UsersTable.query("pk", { ">=": { id: "user-" } }, { limit: 10 });

// Query by index
const result = yield* UsersTable.query("byEmail", { ">=": { email: "a" } });
```

| Operator | Description |
|----------|-------------|
| `>` | Greater than |
| `>=` | Greater than or equal |
| `<` | Less than |
| `<=` | Less than or equal |

Returns `{ items: EntityResult[] }`.

---

### Transactions

Wrap multiple operations in a transaction with automatic commit/rollback.

```typescript
import { SqliteDB } from "@std-toolkit/sqlite";

yield* SqliteDB.transaction(
  Effect.gen(function* () {
    yield* UsersTable.insert(user1);
    yield* UsersTable.insert(user2);
    yield* OrdersTable.insert(order);
    // Auto-commit on success
    // Auto-rollback on any error
  })
);
```

## Adapters

### better-sqlite3 (Node.js)

```typescript
import Database from "better-sqlite3";
import { SqliteDBBetterSqlite3 } from "@std-toolkit/sqlite/adapters/better-sqlite3";

const db = new Database("data.db");
const layer = SqliteDBBetterSqlite3(db);
```

### Cloudflare Durable Objects

```typescript
import { SqliteDBDO } from "@std-toolkit/sqlite/adapters/do";

// Inside your Durable Object class
const layer = SqliteDBDO(this.ctx.storage.sql);
```

## Row Metadata

Every row automatically includes metadata fields:

| Field | Type | Description |
|-------|------|-------------|
| `_v` | string | Schema version |
| `_i` | number | Increment counter (bumped on each update) |
| `_u` | string | Updated at (ISO timestamp) |
| `_c` | string | Created at (ISO timestamp) |
| `_d` | boolean | Deleted flag (soft-delete) |

These fields are available when querying and can be used in indexes (e.g., `["status", "_u"]` for ordering by update time).

## Gotchas

- **Soft deletes**: `delete()` sets the `_d` flag, it doesn't remove the row. Use `dangerouslyRemoveAllRows()` for hard deletes.
- **Query operators**: Use string operators (`">"`, `">="`, `"<"`, `"<="`) not symbolic names.
- **Index fields**: Meta fields `_v`, `_u`, `_c` can be included in indexes for compound queries.

## License

MIT
