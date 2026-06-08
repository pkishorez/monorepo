# DynamoDB

A typed, Effect-based **single-table store** for the versioned records the rest
of the toolkit speaks in — the DynamoDB sibling of the SQLite package. Same
mental model, same entity/registry surface; the backend is real DynamoDB
(reached over signed HTTP), so the abstractions are the genuine article rather
than a single-table _pattern_ bolted onto a relational engine.

## The problem

The raw DynamoDB API is marshalled JSON, expression strings, and reserved-word
landmines. This package trades that for a small, disciplined surface: you
declare your entities and the keys you'll look them up by, and you get back
type-safe `insert` / `get` / `update` / `query` Effects. Every item already
carries the toolkit's versioning envelope, so encoding, schema versions,
soft-deletes, and recency come for free — and because the envelope records the
version each item was written at, the store can **evolve its schema** and migrate
old items forward without a downtime window.

## The mental model

Six ideas hold the whole package together:

1. **One table, many entities.** A `DynamoTable` is a single physical table with
   a generic `pk`/`sk` (partition key / sort key) shape — classic single-table
   design. You never make one table per entity. A `DynamoEntity` _shares_ the
   table and carves out its own keyspace by prefixing keys with its name
   (`User#…`, `Order#…`).

2. **The table is a description; the client makes it real.** A `DynamoTable`
   built with `.make(config)` is just configuration — table name, region,
   credentials, endpoint. Operations are Effects; `createDynamoDB(config)` gives
   you the signed-HTTP client, and `table.getTableSchema()` hands you the exact
   `CreateTable` input to provision the physical table (locally we point the
   endpoint at DynamoDB Local).

3. **You store the value; the entity manages the envelope.** You hand an entity
   a plain value validated by an `ESchema`. It wraps it with `meta` (`_e` entity
   name, `_v` schema version, `_u` a monotonic update key, `_d` a soft-delete
   flag), derives the keys, and hands the same shape back.

4. **Access patterns are declared, not improvised.** The primary index addresses
   an item by its id within a partition. Need another lookup — "users by email",
   "orders by status"? You reserve a **global secondary index** (`GSI`) on the
   table and map it on the entity. There is no ad-hoc filter; every query goes
   through a key you named.

5. **Composition and atomicity.** An `EntityRegistry` gathers many entities on
   one shared table, looks them up by name, and runs multi-entity work through
   `transact` — DynamoDB's all-or-nothing `TransactWriteItems`.

6. **Schemas evolve; the store migrates.** An `ESchema` can `.evolve(...)` to a
   new version with a total upgrade function. Old items decode forward on read,
   `update` auto-migrates the item it touches, and `registry.migrate()` rewrites
   a whole table to the latest version, returning a structured report.

## How the pieces fit

```
DynamoTable ──shared by──▶ DynamoEntity<T>        (keyed items, GSIs)
            └─────────────▶ DynamoSingleEntity<T>  (exactly one item, with a default)

EntityRegistry ──gathers──▶ many entities on one table  ──▶ entity(name) / transact()
                                                        └──▶ migrate() → MigrationReport

every item:   meta = { _e, _v, _u, _d }      every op: Effect<…, DynamodbError>
runnable DB:  createDynamoDB(config) + client.createTable({ TableName, ...table.getTableSchema() })
              (endpoint → DynamoDB Local for tests)
```

## How to read this tutorial

Start with **the shared table** — single-table design and how you get a runnable
DB. Then **the entity**: writing and reading versioned items, and soft delete.
Next the two halves of access modelling — **primary keys** (the partition you
query within) and **secondary indexes** (extra access patterns on a GSI). Then
**the single entity** for genuinely singular data, and the **registry** that
composes many entities with transactions. Finally the DynamoDB-specific arc:
**schema evolution** (old items migrate forward on read and update) and **bulk
migration** (rewrite a whole table to the latest version). Each feature teaches
one idea with a runnable example you can expand.
