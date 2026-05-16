---
title: entity.delete
order: 4
---

# entity.delete

**Soft delete.** The row stays on disk; the library sets `_d = 1`,
refreshes `_u`, re-derives every secondary index column, and broadcasts
the deleted entity with `meta._d: true`. Sync consumers observe the
tombstone in the same channel as any other write.

Hard delete is not exposed at the entity layer — the only way to remove
rows is `dangerouslyRemoveAllRows("i know what i am doing")` at the
table.

## Usage

```ts
const deleted = yield * UserEntity.delete({ userId: '1' });
deleted.meta._d; // true
```

## API

| Argument    | Type                                                    | Meaning                                    |
| ----------- | ------------------------------------------------------- | ------------------------------------------ |
| `keyValue`  | `IndexKeyFields<T, TPrimaryPkKeys> & Pick<T, idField>`  | Identifies the row.                        |
| **returns** | `Effect.Effect<EntityType<T>, SqliteDBError, SqliteDB>` | The deleted entity + meta with `_d: true`. |

## Examples

### Filtering deleted rows on read

```ts
const row = yield * UserEntity.get({ userId: '1' });
if (!row || row.meta._d) return null; // treat tombstone as missing
return row.value;
```

## Edge cases

- **Sets `_d = 1` (true) on the existing row.** The library writes a
  new `_data` (the existing payload re-encoded), `_v`, and a fresh
  `_u` alongside `_d = 1`.
- **Returns the deleted entity with `meta._d: true`.** Callers can
  push the tombstone downstream without an extra read.
- **A missing row fails with `deleteFailed("Item not found")`.**
  Delete is read-modify-write — there is no "delete-if-exists"
  shortcut at the entity layer.
- **Secondary index columns are re-derived (with the new `_u`).**
  Timeline-SK indexes need the new `_u` so the tombstone is
  observable in their order.
- **Hard delete is reserved for `dangerouslyRemoveAllRows`.** There
  is no `entity.hardDelete(...)`; only the table-level guard issues
  `DELETE`.

## Tests

Tests live alongside this doc and assert the soft-delete contract.
