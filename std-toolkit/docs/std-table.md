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

The `Std Table` group has siblings under `Database`: the `DynamoDB`,
`IndexedDB`, and `SQLite` groups hold **adapter-native stories** — proofs that
run on one backend only and showcase what makes it worth choosing: DynamoDB's
native operations and raw-client escape hatch, IndexedDB's auto-versioned
setup and multi-tab behavior, SQLite's driver seam. Each of those stories
states in its answer why the capability is not portable; anything every
backend could honor belongs in the parity suite instead.

## What the parity stories deliberately leave out

Three things are true of the abstraction but cannot be proved by a story that
runs identically everywhere. The first stays prose; the other two now have
adapter-native stories.

**Read consistency is not portable.** SQLite and IndexedDB always read the
latest committed write. Real DynamoDB does too for primary-key reads, but its
global secondary indexes are eventually consistent, so a query through a GSI
can lag a write that has already been acknowledged. DynamoDB Local does not
reproduce that lag, so no story can demonstrate it. Design partition-scoped
reads if you need read-your-writes through an index.

**Some operations exist on only one backend.** DynamoDB can update an item in
place with a native expression, read consistently on demand, and batch-insert;
those live under `std-toolkit/db/dynamodb` and bypass the portable contract by
design — the `DynamoDB` story group proves each one. The portable path is
`getAndUpdate`, which reads, applies your change, and writes back
conditionally on the row's update stamp — see
`docs/adr/0002-portable-get-and-update.md`.

**Transactions are buffered, never interactive.** You build operations
(`insertOp`, `getAndUpdateOp`, `getAndCheckOp`, `deleteOp`, `restoreOp`,
`unchangedOp`, `existsOp`, `notExistsOp`) and commit them with `table.transact`.
`getAndCheckOp` reads a keyed Entity, applies a synchronous business check, and
prepares an unchanged check for the accepted value. There is no "open a
transaction, run arbitrary reads and writes inside it" API on any adapter,
because DynamoDB cannot offer one — see
`docs/adr/0001-buffered-transact-ops-only.md`. How the buffered guard reaches a
SQLite driver as data is proved in the `SQLite` group's "Write your own driver"
story.

## Where to read more

- `src/db/CONTEXT.md` — the full ubiquitous language: topology rules, key
  derivation, query semantics, pagination, error boundaries.
- `src/db/docs/adr/` — the decisions that shaped the portable surface.
- `src/db/{dynamodb,idb,sqlite}/CONTEXT.md` — how each adapter maps the
  contract onto its engine.
