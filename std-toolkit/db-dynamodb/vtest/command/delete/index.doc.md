---
title: command.delete
order: 3
---

# command.delete

Maps `DeletePayload` → `entity.delete(payload.key)`. **Always a soft
delete** — hard delete is deliberately not exposed over the wire.

## Payload

```ts
{
  operation: 'delete',
  entity: string,
  key: object,
}
```

## Edge cases

- **No `forceDelete` over the wire.** Hard delete is unsafe for sync
  engines and stream consumers; it is intentionally not part of the
  command surface. Callers that need it must use the entity API
  directly.
- **Deleting a missing row ⇒ `CommandError` with `operation:
'delete'`.** The underlying `noItemToDelete` is preserved in
  `cause`.
- **Response carries the tombstoned entity.** `data.meta._d` is
  `true`, matching `entity.delete`'s contract.

## Tests
