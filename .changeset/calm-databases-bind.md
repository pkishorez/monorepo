---
'std-toolkit': patch
---

This release replaces the database and sync APIs wholesale.

**One table definition, any adapter.** Describe a table once with `StdTable` and
hand it to whichever adapter you're running on:

```ts
const users = StdTable.make('users')
  .primary('pk', 'sk')
  .gsi('byEmail', 'email')
  .build();

const { layer, setup } = DynamoDB.make(users, config);
```

`.entity(schema)` and `.singleEntity(schema)` bind entities to the table. Every
adapter takes the same shape — `DynamoDB.make`, `SQLite.make`, `IDB.make`, and
`Memory.make` — and returns `{ layer, setup }`, so moving a table between
DynamoDB, SQLite, IndexedDB, and the new dependency-free in-memory adapter is a
one-line change.

Adapters live under `std-toolkit/db`: `db/dynamodb`, `db/sqlite`, `db/idb`,
`db/memory`, with SQLite drivers at `db/sqlite/{node,bun,better-sqlite3,durable-object}`.

**One error type.** Everything fails with `DatabaseError` carrying a tagged
`reason` — `ItemAlreadyExists`, `NoItemToUpdate`, `ConditionFailed`,
`TransactFailed`, `DecodeFailed`, and so on. Match on `error.reason._tag`
instead of learning each adapter's error classes.

**Transactions assert as well as write.** Alongside the write ops, `transact`
takes checks that assert without writing — `unchangedOp`, `existsOp`, and
`notExistsOp`. Checks share the ops array and the 100-item limit, and yield
`null` at their position so results line up one-to-one with the ops you passed.
A failed transaction reports a `TransactOutcome` per op, so you can see which
one refused and why.

**Schemas carry their own name.** `ESchema.make('User', { ... })` — the name is
the schema's snapshot identity, must be non-empty, and must be unique across
composed schemas. `toSchema(schema)` derives its identifier from that name.
Snapshots move to `std-toolkit/snapshot`, with `std-toolkit snapshot` verifying
and approving a single-file baseline. Optional fields are rejected at the type
level; model absence as `null` with `Schema.NullOr`. DynamoDB indexes are
classified by how you declare them — `.gsi(...)` is always global, `.lsi(...)`
always local.

**Sync persists to any table and converges across tabs.** Pass any
`StdTable`-backed layer as `createStdSync({ persistenceLayer })`, built from the
exported `syncPersistenceTable`; omit it and sync stays in memory. Tabs sharing
local persistence now stay in step — durable projection positions plus a
`BroadcastChannel` notice let every tab project a confirmed write without
re-fetching it. Configure with `notices: { scope, channel }`; supply your own
transport with `ChannelFactory` outside the browser, and environments without
`BroadcastChannel` simply run without notices.

`createStdSync` takes `runtime`, `onEvent`, `flow`, `cadence`,
`persistenceLayer`, and `notices`, and the instance exposes `dispose()`.
Collections default `gcTime` to 10 seconds, because TanStack DB's five-minute
default arms a ref'd timer that keeps a Node process alive.

Fixes: `pacedUpdate` wrote against the row captured on the first call for a key
rather than the current one, and queued change notices could be dropped when a
persistence runtime was disposed mid-flight.

Requires `effect@^4.0.0-beta.102`.
