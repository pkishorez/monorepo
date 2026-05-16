---
title: command.update
order: 2
---

# command.update

Maps `UpdatePayload` → `entity.update(payload.key, { update:
payload.data })`. Returns `UpdateResponse` with the post-update entity
and timing.

## Payload

```ts
{
  operation: 'update',
  entity: string,
  key: object,
  data: Partial<Omit<T, '_v'>>,
}
```

## Edge cases

- **Partial updates only.** The expression-builder form of
  `entity.update` is intentionally not exposed over the wire — it
  would require shipping closures, not data.
- **No `condition` field.** The wire format does not carry a custom
  condition; only the built-in `_v = latest` lock is in effect.
- **`noItemToUpdate` ⇒ `CommandError` with `operation: 'update'`.**
  The mapping rule from `entity.update` is preserved.
- **Updating a derivation dependency surfaces as `updateItemFailed`.**
  The library still rejects the partial if it includes a derivation
  dep that goes through the expression-builder path (it does not).
  Plain partials recompute derived columns, so changing a derivation
  field is permitted via the wire.

## Tests
