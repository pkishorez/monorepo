---
title: entity.insert
order: 1
---

# entity.insert

Inserts a new row. Insert is **always a conditional put**: the library
adds `attribute_not_exists(pk) AND attribute_not_exists(sk)` so a key
collision is rejected by DynamoDB rather than silently overwriting an
existing row. A user-supplied `condition` is AND-ed on top of the
collision check.

## Usage

```ts
const entity =
  yield *
  UserEntity.insert({
    id: '1',
    email: 'a@b.com',
    name: 'A',
  });
entity.value._v; // 'v1' — stamped by the library
entity.meta._u; // ISO timestamp of this write
```

## API

| Argument            | Type                                          | Meaning                                                           |
| ------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| `value`             | `Omit<ESchemaType<TSchema>, '_v'>`            | The payload. **`_v` must not be passed** — the library stamps it. |
| `options.condition` | `ConditionInput<T>`                           | Extra condition AND-ed with the built-in collision check.         |
| **returns**         | `Effect.Effect<EntityType<T>, DynamodbError>` | Inserted entity with fresh meta.                                  |

## Examples

### Custom insert condition

```ts
const cond = exprCondition<User>(($) =>
  $.or(
    $.attributeNotExists('email'),
    $.cond('email', '<>', 'reserved@example.com'),
  ),
);
yield * UserEntity.insert(value, { condition: cond });
```

### Inside a transaction

```ts
const op = yield * UserEntity.insertOp(value);
yield * registry.transact([op]);
```

## Edge cases

- **Insert always stamps `_v` and `_u`.** `_v` is the entity's latest
  schema version at write time; `_u` is `new Date().toISOString()` at
  the moment of the call. The caller cannot override either.
- **`_d` defaults to `false` on insert.** A freshly inserted row is
  never a tombstone, even if you somehow pass `_d: true` — the meta
  block is written by the library.
- **Key collisions surface as `DynamodbError.itemAlreadyExists()`.** The
  underlying DynamoDB `ConditionalCheckFailed` is translated into a
  named error so callers can match on it without inspecting the AWS
  error tag.
- **User condition is AND-ed, not replaced.** The built-in
  `attribute_not_exists(pk) AND attribute_not_exists(sk)` cannot be
  disabled; your condition is added in addition.
- **Index columns are written from the value.** Every derived
  partition/sort key (primary + every registered GSI for which all
  `pkDeps`/`skDeps` are present) is written in the same `PutItem`. An
  undefined derivation key omits that GSI column.
- **Broadcast fires only after the put succeeds.** The
  `ConnectionService.broadcast` call is sequenced after the DynamoDB
  ack, so a failed insert never emits a phantom entity.

## Tests
