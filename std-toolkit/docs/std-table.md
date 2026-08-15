# Std Table

One logical table, one set of operations, three real databases underneath.

A **std-table** is a single physical table with a partition key, a sort key,
and a handful of secondary index slots — the DynamoDB shape, because it is the
most restrictive of the three. Everything else is derived from it: SQLite gets
key columns and indexes, IndexedDB gets an object store with the same indexes.
Entities are bound to the table by an evolving schema and an access pattern,
and every row carries the metadata the table needs to tell entity types apart
(`_e`), migrate old payloads (`_v`), detect concurrent writes (`_u`), and
tombstone deletions (`_d`).

The point of the abstraction is that the answer to "what happens if…" does not
depend on which database you deployed against. The `Std Table` story group is
the executable proof of that claim: every question runs its code against
DynamoDB Local, IndexedDB, and SQLite in the same proof and shows all three
results side by side. If a backend ever diverges, the story fails.

Run them with `pnpm stories`. DynamoDB Local must be listening first:

```sh
pnpm dynamodb:local        # docker, port 8090
pnpm stories
```

The endpoint is `DYNAMODB_LOCAL_ENDPOINT`, defaulting to
`http://localhost:8090`. Nothing is skipped when it is missing — the DynamoDB
half of every question fails loudly instead.

## What the stories deliberately leave out

Three things are true of the abstraction but cannot be proved by a story that
runs identically everywhere.

**Read consistency is not portable.** SQLite and IndexedDB always read the
latest committed write. Real DynamoDB does too for primary-key reads, but its
global secondary indexes are eventually consistent, so a query through a GSI
can lag a write that has already been acknowledged. DynamoDB Local does not
reproduce that lag, so no story can demonstrate it. Design partition-scoped
reads if you need read-your-writes through an index.

**Some operations exist on only one backend.** DynamoDB can update an item in
place with a native expression, read consistently on demand, and batch-insert;
those live under `std-toolkit/db/dynamodb` and bypass the portable contract by
design. The portable path is `getAndUpdate`, which reads, applies your change,
and writes back conditionally on the row's update stamp — see
`docs/adr/0002-portable-get-and-update.md`.

**Transactions are buffered, never interactive.** You build operations
(`insertOp`, `getAndUpdateOp`, `deleteOp`, `restoreOp`) and commit them with
`table.transact`. There is no "open a transaction, run arbitrary reads and
writes inside it" API on any adapter, because DynamoDB cannot offer one — see
`docs/adr/0001-buffered-transact-ops-only.md`.

## Where to read more

- `src/db/CONTEXT.md` — the full ubiquitous language: topology rules, key
  derivation, query semantics, pagination, error boundaries.
- `src/db/docs/adr/` — the decisions that shaped the portable surface.
- `src/db/{dynamodb,idb,sqlite}/CONTEXT.md` — how each adapter maps the
  contract onto its engine.
