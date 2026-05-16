---
title: Broadcast
order: 8
---

# Broadcast

Every successful single-row write (`insert`, `update`, `delete`)
calls `ConnectionService.broadcast({ value, meta })`. The service is
**optional**: if no `ConnectionService` is provided in the Effect
context, the broadcast is a no-op. Subscribers attached to the
service see in-process writes immediately, before DynamoDB Streams
would have fanned the change out.

## When broadcast fires

| Operation               | Broadcast?                                                |
| ----------------------- | --------------------------------------------------------- |
| `insert`                | ✅ after the put succeeds                                 |
| `update`                | ✅ after the update succeeds                              |
| `delete` (soft)         | ✅ via the internal `update({ _d: true })`                |
| `delete` (hard)         | ✅ — synthetic `{ value, meta: { ..., _d: true } }`       |
| `batchInsert`           | ❌ no broadcast (batched writes do not emit)              |
| `insertOp` / `updateOp` | ❌ alone — fires only when wrapped by `registry.transact` |
| `query` / `subscribe`   | `subscribe` emits via `service.emit` per drained item     |

## Examples

### Wiring a broadcast subscriber

```ts
const Subscriber = Layer.effectDiscard(
  Effect.gen(function* () {
    const conn = yield* ConnectionService;
    yield* conn.onBroadcast((entity) => Effect.log('saw', entity));
  }),
);
```

## Edge cases

- **Broadcast fires only after the DynamoDB ack.** A failed put never
  emits a phantom entity. The sequencing inside the operation is
  put-then-broadcast, not the other way around.
- **No `ConnectionService` in context → silent no-op.** The library
  reads `Effect.serviceOption(ConnectionService)` and only calls
  `broadcast` if the service is present.
- **`subscribe` is the streaming variant of broadcast.** It drains
  every row strictly after a cursor via `service.emit`, then attaches
  the live subscription with `service.subscribe(entityName)`.
- **`batchInsert` is intentionally silent.** The expectation is that
  batches are large bulk imports; pushing one broadcast per row
  would overwhelm subscribers. Use single `insert` if you need the
  emit.
- **Transactional broadcast happens on the registry side.** Each
  `TransactItem.broadcast` is fanned out only after `registry.transact`
  succeeds, in input order.

## Tests
