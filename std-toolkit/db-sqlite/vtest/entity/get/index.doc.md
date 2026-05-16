---
title: entity.get
order: 1
---

# entity.get

Reads a single row by its primary-key fields. The library derives `pk`
and `sk` from the values you pass — you never spell them out. Returns
`EntityType<T>` (value + meta) or `null` when the row is missing.

## Usage

```ts
const result = yield * UserEntity.get({ userId: '1' });
if (!result) return; // null = missing
result.value; // schema-decoded payload
result.meta; // { _e, _v, _u, _d }
```

## API

| Argument    | Type                                                            | Meaning                                     |
| ----------- | --------------------------------------------------------------- | ------------------------------------------- |
| `keyValue`  | `IndexKeyFields<T, TPrimaryPkKeys> & Pick<T, idField>`          | Fields that derive the primary `pk` + `sk`. |
| **returns** | `Effect.Effect<EntityType<T> \| null, SqliteDBError, SqliteDB>` | `null` for a missing row, never thrown.     |

## Examples

### Lifting the nullable result

```ts
import { Option } from 'effect';

const user =
  yield *
  UserEntity.get({ userId: '1' }).pipe(
    Effect.map(Option.fromNullable),
    Effect.flatMap(Effect.fromOption),
  );
```

### Working with the meta envelope

```ts
const row = yield * UserEntity.get({ userId: '1' });
if (row?.meta._d) return; // soft-deleted, skip
```

## Edge cases

- **`null` for missing rows, not an error.** A missing row is a
  normal outcome — `Effect.fromNullable` / `Option.fromNullable` is
  the lift.
- **Soft-deleted rows are still returned, with `_d: true`.** Soft
  delete is part of the data surface; the caller decides whether to
  treat the tombstone as "missing". This is what lets sync consumers
  observe deletes.
- **`sk` is always the entity's `idField` value.** You pass the id
  as part of `keyValue`; the SK is derived from it, never set
  directly.
- **`_d` on disk is `INTEGER 0|1`, decoded into `boolean` `meta._d`.**
  SQLite has no native boolean — the library decodes it into a real
  boolean so the entity-facing meta is identical to `db-dynamodb`.

## Tests

Tests live alongside this doc and assert the shape of the request /
response contract.
