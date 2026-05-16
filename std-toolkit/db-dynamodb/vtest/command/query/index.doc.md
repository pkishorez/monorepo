---
title: command.query
order: 4
---

# command.query

Maps `QueryPayload` → `entity.query(payload.index, { pk, sk }, { limit
})`. The index name is part of the payload, so a wire client can pick
between primary and any registered secondary index by string.

## Payload

```ts
{
  operation: 'query',
  entity: string,
  index: 'primary' | string,
  pk: object,
  sk: SkCondition,
  limit?: number,
}
```

## Edge cases

- **`SkCondition` is the wire-shape of `SkParam`.** The library
  translates it via `#convertSkCondition`; same operators (`>=`, `>`,
  `<=`, `<`, `beginsWith`, `null`).
- **Unknown index name ⇒ `CommandError` wrapping `queryFailed`.** The
  inner message is `Index <name> not found`.
- **Query streaming is not exposed.** `entity.queryStream` /
  `subscribe` are intentionally not part of the command surface; they
  require a streaming transport.
- **Soft-deleted rows are returned.** `command.query` has no
  awareness of `_d` — callers filter tombstones if they need to.
- **`limit` is pass-through.** Omit it to take the DynamoDB default
  page limit.

## Tests
