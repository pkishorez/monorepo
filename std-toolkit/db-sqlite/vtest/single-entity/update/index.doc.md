---
title: single-entity.update
order: 3
---

# single-entity.update

Partial merge update. Reads the existing row, merges the partial,
refreshes `_u`, and writes back. **Fails** with
`updateFailed("Item not found")` if the row has never been written
(synthetic-meta `_u === ''`) — there is no implicit insert.

## Usage

```ts
const updated = yield * AppConfig.update({ update: { maxRetries: 5 } });
updated.value.maxRetries; // 5
updated.meta._u; // fresh ISO timestamp
```

## API

| Argument        | Type                                                          | Meaning                         |
| --------------- | ------------------------------------------------------------- | ------------------------------- |
| `params.update` | `Partial<Omit<T, '_v'>>`                                      | Fields to merge.                |
| **returns**     | `Effect.Effect<SingleEntityType<T>, SqliteDBError, SqliteDB>` | The merged entity + fresh meta. |

## Edge cases

- **Partial merges only the listed fields.** Omitted fields keep
  their stored value.
- **An absent row fails with `updateFailed` (no implicit insert).**
  That is what the mandatory `default(...)` and `put(...)` are for.
- **`_v` is taken from the schema (never the caller).**
- **`_u` is refreshed on every successful update.**
- **Broadcast fires after the write, with `meta._d: false`.** Single
  entities have no soft delete; the envelope still carries
  `_d: false` so subscribers can share one code path.

## Tests

Tests live alongside this doc.
