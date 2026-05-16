---
title: entity.update
order: 3
---

# entity.update

Partial merge update. The library reads the existing row, merges the
partial on top, re-derives every secondary index column, refreshes
`_u`, and writes back. If the row doesn't exist, it fails with
`SqliteDBError.updateFailed(table, "Item not found")` — there is no
implicit insert.

## Usage

```ts
const updated = yield * UserEntity.update({ userId: '1' }, { name: 'A2' });
updated.value; // { userId: '1', email, name: 'A2' }
updated.meta._u; // fresh ISO timestamp
```

## API

| Argument    | Type                                                    | Meaning                         |
| ----------- | ------------------------------------------------------- | ------------------------------- |
| `keyValue`  | `IndexKeyFields<T, TPrimaryPkKeys> & Pick<T, idField>`  | Identifies the row.             |
| `updates`   | `Partial<Omit<T, '_v'>>`                                | Fields to merge.                |
| **returns** | `Effect.Effect<EntityType<T>, SqliteDBError, SqliteDB>` | The merged entity + fresh meta. |

## Examples

### Update that changes a secondary-index PK

```ts
yield * UserEntity.update({ userId: '1' }, { email: 'new@b.com' });
// IDX1PK is rewritten because `email` is the byEmail PK
```

## Edge cases

- **`updates` is a partial; only listed fields are merged.** Omitted
  fields keep their stored value.
- **A missing row fails with `updateFailed("Item not found")`.**
  Update is read-modify-write — the read can fail with a typed
  error rather than silently inserting.
- **`_u` is refreshed on every successful update.** The library
  generates a new ISO timestamp; that is what makes timeline-SK
  indexes self-cursoring.
- **Secondary index columns are re-derived from the merged row.**
  If a secondary-index PK or SK depends on a field you changed, the
  column is rewritten in place.
- **Caller cannot pass `_v` in `updates`.** The input type is
  `Partial<Omit<T, '_v'>>`; schema version is the schema's concern.

## Tests

Tests live alongside this doc and assert the merge / error contract.
