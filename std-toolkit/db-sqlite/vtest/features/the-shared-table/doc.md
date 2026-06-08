# The shared table

Everything in this package sits on one idea borrowed from DynamoDB:
**single-table design**. Instead of a table per type, you create _one_
`SQLiteTable` with a generic shape — a partition key `pk` and a sort key `sk` —
and let every entity share it. Rows are told apart by what you put in `pk`/`sk`,
not by which table they live in.

## Defining a table

You name the physical table and declare its primary key columns. Secondary
index columns can be added with `.index(...)`; we'll use those later. `.build()`
hands back the table instance.

```ts
const table = SQLiteTable.make({ tableName: 'std_data' })
  .primary('pk', 'sk')
  .build();
```

A table on its own does nothing — it's a description. To act on a real database
you need two things: a `setup()` to create the physical table and indexes, and a
**DB layer** that says _which_ SQLite engine to talk to.

## Getting a runnable database

Operations in this package are `Effect<…, SqliteDBError, SqliteDB>`. The
`SqliteDB` in the requirements channel is satisfied by an **adapter layer**. For
Node tests we use the better-sqlite3 adapter against an in-memory database:

```ts
import Database from 'better-sqlite3';
import { SqliteDBBetterSqlite3 } from '@std-toolkit/sqlite/adapters/better-sqlite3';

const layer = SqliteDBBetterSqlite3(new Database(':memory:'));
yield * table.setup().pipe(Effect.provide(layer));
```

Swap that one layer for `./adapters/bun` or `./adapters/do` and the same entity
code runs on Bun or a Cloudflare Durable Object — nothing else changes.

::test-group{id=setup-and-store}
