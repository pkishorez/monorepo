---
title: table.setup
order: 1
---

# table.setup

`SQLiteTable#setup()` is the one-call lifecycle that creates the shared
table and reconciles it with the currently registered secondary
indexes. It is **idempotent and additive** — safe to run on every
boot, never destructive.

## Usage

```ts
const table = SQLiteTable.make({ tableName: 'std_data' })
  .primary('pk', 'sk')
  .index('IDX1', 'IDX1PK', 'IDX1SK')
  .build();

await Effect.runPromise(table.setup().pipe(Effect.provide(dbLayer)));
```

## API

| Member              | Type                                           | Meaning                                           |
| ------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `tableName`         | `string`                                       | Physical SQLite table name.                       |
| `primary`           | `{ pk: string; sk: string }`                   | Names of the composite-PK columns.                |
| `secondaryIndexMap` | `Record<string, { pk: string; sk: string }>`   | Registered index → column pair.                   |
| `setup()`           | `Effect.Effect<void, SqliteDBError, SqliteDB>` | Runs DDL: CREATE TABLE, ADD COLUMN, CREATE INDEX. |

What `setup()` actually does, in order:

1. `CREATE TABLE IF NOT EXISTS` with the seven library-owned columns
   plus every registered secondary `<IDXn>PK` / `<IDXn>SK` pair, with a
   composite primary key on `(pk, sk)`.
2. For each registered secondary index: `ALTER TABLE ADD COLUMN
IF NOT EXISTS` (the implementation tolerates the column already
   existing — that's how new indexes land on existing databases).
3. `CREATE INDEX IF NOT EXISTS idx_<table>_<name>` on each secondary
   index pair.

## Examples

### Register two indexes and create the table

```ts
const table = SQLiteTable.make({ tableName: 'std_data' })
  .primary('pk', 'sk')
  .index('IDX1', 'IDX1PK', 'IDX1SK')
  .index('IDX2', 'IDX2PK', 'IDX2SK')
  .build();

yield * table.setup();
```

### Add a new index on an already-populated database

Just add another `.index(...)` to the builder and ship. The next
`setup()` adds the column and the SQLite index without rewriting
existing rows. Backfill writes will populate the new column on next
update; reads on the new index see only rows written / updated since.

## Edge cases

- **Composite primary key is (pk, sk).** Every row is keyed by `(pk,
sk)`. The library is hard-wired to a two-column composite key — the
  builder only lets you rename the columns.
- **Secondary index columns are derived from `.index(name, pk, sk)`.**
  Whatever strings you pass become the actual SQLite column names.
- **`tableName` is exposed for error messages and RPC routing.** All
  errors embed it; the registry and command processor use it for
  diagnostics.
- **`setup()` is an Effect, never a thunk.** You can compose it inside
  `Effect.gen`, retry it, or pipe a layer — it is _not_ run on
  `.build()`.
- **`index()` throws synchronously for an unknown name.** The library
  catches typos at the call site rather than letting them surface as a
  SQLite error later.

## Tests

Tests live alongside this doc and assert the builder output shape, not
the live SQLite DDL — that's covered by
`src/services/__tests__/entity.test.ts`.
