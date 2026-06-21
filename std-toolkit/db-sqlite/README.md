# db-sqlite

Single-table-design entity store for SQLite, built with Effect.

You define versioned entity schemas, place them on a shared table, register them, and
operate through type-safe entity handles. The same code runs against any SQLite backend
via a pluggable adapter layer (better-sqlite3, `node:sqlite`, Bun, Cloudflare Durable
Objects).

## Prerequisites

- [Effect](https://effect.website) — the TypeScript library for building robust applications
- [@std-toolkit/eschema](../eschema) — evolving schema with versioning

## Getting Started

### 1. Define entity schemas

Each schema declares a name, its id field, and its data fields.

```typescript
import { EntityESchema } from '@std-toolkit/eschema';
import { Schema } from 'effect';

const UserSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  name: Schema.String,
  status: Schema.Literals(['active', 'inactive']),
}).build();

const PostSchema = EntityESchema.make('Post', 'postId', {
  authorId: Schema.String,
  title: Schema.String,
  content: Schema.String,
}).build();
```

### 2. Create the shared table

A single physical table holds every entity. It declares the primary key columns and the
secondary index columns (each index has its own pk/sk column pair).

```typescript
import { SQLiteTable } from '@std-toolkit/sqlite';

const table = SQLiteTable.make({ tableName: 'std_data' })
  .primary('pk', 'sk')
  .index('IDX1', 'IDX1PK', 'IDX1SK')
  .index('IDX2', 'IDX2PK', 'IDX2SK')
  .build();
```

### 3. Define entities on the table

Each entity maps its schema onto the shared table's primary key and any secondary
indexes. The sort key is derived automatically — the id field for the primary index,
`_u` (updated-at) for secondary indexes.

```typescript
import { SQLiteEntity } from '@std-toolkit/sqlite';

const userEntity = SQLiteEntity.make(table)
  .eschema(UserSchema)
  .primary() // pk: entity name, sk: userId
  .index('IDX1', 'byEmail', { pk: ['email'] })
  .index('IDX2', 'byStatus', { pk: ['status'] })
  .build();

const postEntity = SQLiteEntity.make(table)
  .eschema(PostSchema)
  .primary({ pk: ['authorId'] }) // pk: Post#authorId, sk: postId
  .index('IDX1', 'byAuthor', { pk: ['authorId'] })
  .build();
```

### 4. Register and provide a database layer

```typescript
import Database from 'better-sqlite3';
import { EntityRegistry } from '@std-toolkit/sqlite';
import { betterSqlite3Layer } from '@std-toolkit/sqlite/adapters/better-sqlite3';

const registry = EntityRegistry.make(table)
  .register(userEntity)
  .register(postEntity)
  .build();

const db = new Database('data.db');
const layer = betterSqlite3Layer(db);
```

### 5. Use it

Operations return Effects requiring `SqliteDB`, satisfied by the adapter layer.

```typescript
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  yield* registry.setup(); // create table + indexes (idempotent)

  yield* userEntity.insert({
    userId: 'u1',
    email: 'alice@example.com',
    name: 'Alice',
    status: 'active',
  });

  const user = yield* userEntity.get({ userId: 'u1' });
  console.log(user?.value.name); // "Alice"
});

Effect.runPromise(program.pipe(Effect.provide(layer)));
```

## Entity Operations

Operations live on the entity handle (`SQLiteEntity`), not the table.

| Operation                     | Returns                        | Description                            |
| ----------------------------- | ------------------------------ | -------------------------------------- |
| `registry.setup()`            | `void`                         | Create table and indexes (idempotent)  |
| `insert(value)`               | `{ value, meta }`              | Insert a new entity                    |
| `get(key)`                    | `{ value, meta } \| null`      | Get a single entity by primary key     |
| `update(key, updates)`        | `{ value, meta }`              | Update an existing entity              |
| `delete(key)`                 | `{ value, meta }`              | Soft-delete (sets the `_d` flag)       |
| `query(index, params, opts?)` | `{ items: { value, meta }[] }` | Query the primary or a secondary index |

Every result carries `value` (the decoded entity) and `meta` (row metadata, see below).

### get

```typescript
const result = yield * userEntity.get({ userId: 'u1' });
// result is null if not found
// result.value - the entity
// result.meta  - { _v, _i, _u, _c, _d }
```

### query

Query the primary index with `"primary"`, or a secondary index by name. Provide the
partition key fields and a sort-key condition.

```typescript
// Primary index
const posts =
  yield *
  postEntity.query('primary', {
    pk: { authorId: 'u1' },
    sk: { '>=': null }, // null = no sort-key bound
  });

// Secondary index
const byEmail =
  yield *
  userEntity.query('byEmail', {
    pk: { email: 'alice@example.com' },
    sk: { '>=': null },
  });

// posts.items - array of { value, meta }
```

Sort-key conditions support `>`, `>=`, `<`, `<=`, `=`, `between`, and `beginsWith`.

### Transactions

Wrap multiple operations in a transaction via the registry. Commits on success, rolls
back on any error.

```typescript
yield *
  registry.transaction(
    Effect.gen(function* () {
      yield* userEntity.insert(user);
      yield* postEntity.insert(post);
    }),
  );
```

## Adapters

The entity code is backend-agnostic. Pick the adapter for your runtime and provide its
layer; each is published as an independent subpath so a given runtime only ever loads its
own adapter.

### better-sqlite3 (Node.js)

```typescript
import Database from 'better-sqlite3';
import { betterSqlite3Layer } from '@std-toolkit/sqlite/adapters/better-sqlite3';

const db = new Database('data.db');
const layer = betterSqlite3Layer(db);
```

### node:sqlite (Node.js built-in)

Uses the built-in `node:sqlite` module — no native dependency to install. Requires
**Node.js 24+** (the module is stable as of Node 24; earlier versions expose it only
behind the `--experimental-sqlite` flag).

```typescript
import { DatabaseSync } from 'node:sqlite';
import { nodeSqliteLayer } from '@std-toolkit/sqlite/adapters/node';

const db = new DatabaseSync('data.db');
const layer = nodeSqliteLayer(db);
```

### Bun (bun:sqlite)

```typescript
import { Database } from 'bun:sqlite';
import { bunSqliteLayer } from '@std-toolkit/sqlite/adapters/bun';

const db = new Database('data.db');
const layer = bunSqliteLayer(db);
```

### Cloudflare Durable Objects

```typescript
import { durableObjectSqliteLayer } from '@std-toolkit/sqlite/adapters/do';

// Inside your Durable Object class
const layer = durableObjectSqliteLayer(this.ctx.storage.sql);
```

## Row Metadata

Every row automatically carries metadata, returned as `meta` on every operation:

| Field | Type    | Description                               |
| ----- | ------- | ----------------------------------------- |
| `_v`  | string  | Schema version                            |
| `_i`  | number  | Increment counter (bumped on each update) |
| `_u`  | string  | Updated at (ISO timestamp)                |
| `_c`  | string  | Created at (ISO timestamp)                |
| `_d`  | boolean | Deleted flag (soft-delete)                |

`_u` is the default sort key for secondary indexes, giving you update-time ordering for
free.

## Gotchas

- **Soft deletes**: `delete()` sets the `_d` flag, it doesn't remove the row. For a hard
  delete of every row, use `table.dangerouslyRemoveAllRows('i know what i am doing')`.
- **Sort-key conditions**: use string operators (`">"`, `">="`, `"<"`, `"<="`, `"="`),
  or `between` / `beginsWith`. Pass `{ '>=': null }` for "no bound".
- **Single-table design**: all entities share one physical table; entity identity is
  encoded in the partition key (e.g. `User`, `Post#authorId`).

## License

MIT
