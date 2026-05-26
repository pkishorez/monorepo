---
title: entity.hardDelete
order: 5
---

# entity.hardDelete

**Physical delete.** Removes all rows for this entity type from the
shared table. Other entity types registered in the same table are
untouched.

## Usage

```ts
const result = yield * UserEntity.hardDelete();
result.rowsDeleted; // number of rows removed
```

## API

| Argument    | Type                                                              | Meaning                                 |
| ----------- | ----------------------------------------------------------------- | --------------------------------------- |
| `where`     | `Where` (optional)                                                | Additional row filter combined via AND. |
| **returns** | `Effect.Effect<{ rowsDeleted: number }, SqliteDBError, SqliteDB>` | Count of physically removed rows.       |

## Edge cases

- **Deletes only rows matching the entity `_e` column.** The generated
  SQL is `DELETE FROM <table> WHERE _e = <entityName>`. Rows from
  other registered entities are preserved.
- **Returns `{ rowsDeleted }` count.** The return value reports how
  many rows were physically removed.
- **Accepts an optional where clause for conditional deletion.**
  `hardDelete(where)` combines the entity filter with the
  caller-provided where clause via AND.

## Tests

Tests live alongside this doc and assert the hard-delete contract.
