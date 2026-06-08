# SQLite

A typed, Effect-based **single-table store** for the versioned records the rest
of the toolkit speaks in. When a server (or a browser, or a Durable Object)
needs durable, queryable storage with strict access patterns, it reaches for
this package. Its job is to give you DynamoDB-style _single-table design_ on top
of plain SQLite: one physical table, many logical entities, every access pattern
pre-declared as an index.

## The problem

Raw SQLite gives you tables and SQL strings. That's a lot of rope. This package
trades arbitrary SQL for a small, disciplined surface: you declare your entities
and the keys you'll look them up by, and you get back type-safe `insert` /
`get` / `query` Effects. Every row already carries the toolkit's versioning
envelope, so encoding, schema versions, soft-deletes, and recency come for free.

## The mental model

Five ideas hold the whole package together:

1. **One table, many entities.** A `SQLiteTable` is a single physical table with
   a generic `pk`/`sk` (partition key / sort key) shape — the DynamoDB
   single-table pattern. You never make one table per entity. Instead a
   `SQLiteEntity` _shares_ the table and carves out its own keyspace by prefixing
   keys with its name (`User#…`, `Post#…`).

2. **The DB is a service, the adapter is a layer.** Operations are
   `Effect<…, SqliteDBError, SqliteDB>`. You satisfy the `SqliteDB` requirement
   by providing an adapter layer — `SqliteDBBetterSqlite3(db)` for Node, plus
   `bun` and Durable-Object adapters — so the same entity code runs on any
   backend.

3. **You store the value; the entity manages the envelope.** You hand an entity
   a plain value validated by an `ESchema`. It wraps it with `meta`
   (`_e` entity name, `_v` schema version, `_u` a monotonic update key, `_d` a
   soft-delete flag), derives the keys, and hands the same shape back. Versioning,
   ordering, and sync all ride on that envelope.

4. **Access patterns are declared, not improvised.** The primary index addresses
   a record by its id within a partition. Need another lookup — "users by email",
   "posts by author over time"? You declare a **secondary index** up front. There
   is no ad-hoc `WHERE`; every query goes through a key you named.

5. **Composition and atomicity.** An `EntityRegistry` gathers many entities on
   one shared table, sets it up in one call, and wraps multi-entity work in a
   `transaction`. A `SqliteCommand` turns the whole registry into a single
   JSON-in/JSON-out processor for RPC.

## How the pieces fit

```
SQLiteTable ──shared by──▶ SQLiteEntity<T>        (keyed records, secondary indexes)
            └─────────────▶ SQLiteSingleEntity<T>  (exactly one record, with a default)

EntityRegistry ──gathers──▶ many entities on one table  ──▶ setup() / transaction()
                                                        └──▶ SqliteCommand (JSON RPC surface)

every row:    meta = { _e, _v, _u, _d }      every op: Effect<…, SqliteDBError, SqliteDB>
runnable DB:  Effect.provide(SqliteDBBetterSqlite3(new Database(':memory:')))
```

## How to read this tutorial

Start with **the shared table** — how single-table design works and how you get
a runnable DB. Then **the entity**: writing and reading versioned records, and
soft delete. Next the two halves of access modelling — **primary keys** (the
partition you query within) and **secondary indexes** (extra access patterns).
Then **the single entity** for genuinely singular data, and finally **the
registry** that composes many entities on one table with transactions. Each
feature teaches one idea with a runnable example you can expand.
