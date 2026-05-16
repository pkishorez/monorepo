---
title: entity.get
order: 3
---

# entity.get

Reads a single row by its primary-key fields. The library derives `pk`
and `sk` from the values you pass — you never spell them out. Returns
`EntityType<T>` (value + meta) or `null` when the row is missing.

## Usage

```ts
const result = yield * UserEntity.get({ id: '1' });
if (!result) return; // null = missing
result.value; // schema-decoded payload
result.meta; // { _e, _v, _u, _d }
```

## API

| Argument    | Type                                                  | Meaning                                     |
| ----------- | ----------------------------------------------------- | ------------------------------------------- |
| `keyValue`  | `IndexPkValue<T, TPrimaryPkKeys> & Pick<T, idField>`  | Fields that derive the primary `pk` + `sk`. |
| `options`   | `{ ConsistentRead?: boolean }`                        | Pass-through to DynamoDB `GetItem`.         |
| **returns** | `Effect.Effect<EntityType<T> \| null, DynamodbError>` | `null` for a missing row, never thrown.     |

## Examples

### Strongly-consistent read

```ts
yield * UserEntity.get({ id: '1' }, { ConsistentRead: true });
```

### Lifting the nullable result

```ts
import { Option } from 'effect';

const user =
  yield *
  UserEntity.get({ id: '1' }).pipe(
    Effect.map(Option.fromNullable),
    Effect.flatMap(Effect.fromOption),
  );
```

## Edge cases

- **`null` for missing rows, not an error.** A missing row is a normal
  outcome — `Effect.fromNullable` / `Option.fromNullable` is the lift.
- **Soft-deleted rows are returned.** `_d: true` is part of the data
  surface; the caller decides whether to treat the tombstone as
  "missing". This is what lets sync consumers observe deletes.
- **Decode errors map to `DynamodbError.getItemFailed`.** A row whose
  `_v` no longer round-trips (corrupt) surfaces as a failure, not
  `null`. Use [`inspectMigration`](../migration/index.doc.md) to
  classify the stored bytes without raising.
- **`sk` is always the entity's `idField` value.** You pass the id as
  part of `keyValue`; the SK is derived from it, never set directly.
- **`ConsistentRead` is opt-in, defaults to false.** DynamoDB's eventual
  read is cheaper and sufficient for the common case.

## Tests

Tests live alongside this doc and assert the shape of the request /
response contract, not the live DynamoDB call.
