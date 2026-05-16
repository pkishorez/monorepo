---
title: entity.broadcast
order: 9
---

# entity.broadcast

Every successful entity write — insert, update, soft-delete — fires
`ConnectionService.broadcast(entity)`. Inside
`registry.transaction(effect)` those broadcasts are buffered in a
`FiberRef` and flushed in insertion order on commit; on rollback they
are dropped.

This isn't a separate method — it's the side-effect that the CRUD
methods perform on success.

## Why it exists

A sync consumer doesn't see SQL directly; it sees the broadcast
channel. The broadcast must:

1. **Reflect the row that actually landed** — so it fires _after_
   the write, never before.
2. **Match the on-disk truth even across multiple writes** — so it is
   buffered inside a transaction and only emitted once the whole
   batch commits.
3. **Be optional** — server-only concerns; CLI / test code that
   doesn't provide `ConnectionService` keeps working.

```
write → success ┐
                ├─ no txn       → service.broadcast(entity) immediately
                ├─ in txn       → FiberRef push(entity)
                └─ txn commit   → for entity of buffer: service.broadcast(entity)
                                  FiberRef.set(none)
                └─ txn rollback → FiberRef.set(none); never emitted
```

## API contract (no direct method)

The `_broadcast` side-effect is invoked at the end of:

- `entity.insert(...)`
- `entity.update(...)`
- `entity.delete(...)` (with `meta._d: true`)
- `singleEntity.put(...)`
- `singleEntity.update(...)`

The result of those methods is the entity that was broadcast.

## Edge cases

- **Broadcast fires AFTER the write lands, never before.** The
  library calls `service.broadcast(entity)` only on the success path
  of the Effect; a SQL failure suppresses the broadcast.
- **Inside a transaction, broadcast is buffered, not emitted.**
  Successful writes inside `registry.transaction(...)` append to the
  `TransactionPendingBroadcasts` `FiberRef`; downstream subscribers
  see nothing until commit.
- **Commit flushes pending broadcasts in insertion order.** After
  SQLite `COMMIT` succeeds, the registry iterates the buffer and
  broadcasts each entity, then resets the `FiberRef` to `none`.
- **Rollback drops pending broadcasts entirely.** A failed
  transaction never flushes — the buffer is reset to `none` after
  the rollback.
- **`ConnectionService` is optional — no service, no broadcast.**
  Server-only code provides `ConnectionService`. In a CLI / test
  script, the write still succeeds and broadcast is a no-op.

## Tests

Tests live alongside this doc.
