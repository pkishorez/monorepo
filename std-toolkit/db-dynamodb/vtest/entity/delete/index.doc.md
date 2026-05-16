---
title: entity.delete
order: 6
---

# entity.delete

Removes a row. **Soft delete is the default**: the library writes
`_d: true` and refreshes `_u`, so the row stays in the table and
downstream streams / sync engines can observe the tombstone. Hard
delete is an opt-in escape hatch — it physically removes the row and
is unsafe for any consumer that replays changes.

## Usage

```ts
// Soft delete (default)
yield * UserEntity.delete({ id: '1' });

// Hard delete (opt-in, dangerous)
yield *
  UserEntity.delete({ id: '1' }, { forceDelete: 'I know what I am doing' });
```

## API

| Argument              | Type                                                 | Meaning                                                              |
| --------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| `keyValue`            | `IndexPkValue<T, TPrimaryPkKeys> & Pick<T, idField>` | Fields that derive the primary `pk` + `sk`.                          |
| `options.forceDelete` | `'I know what I am doing'`                           | Literal acknowledgement; any other value (including `true`) is soft. |
| **returns**           | `Effect.Effect<EntityType<T>, DynamodbError>`        | The deleted entity, with `_d: true` for both soft and hard paths.    |

## Examples

### Soft delete (default)

Internally this is an `update({ _d: true })`. The row stays in the
table; secondary-index tombstones land on every `_u`-SK index.

```ts
yield * UserEntity.delete({ id: '1' });
```

### Hard delete (opt-in)

The library reads the row first (so the broadcast payload is complete),
issues a `DeleteItem`, and emits a synthetic `{ value, meta: { ..., _d:
true } }` so downstream subscribers still see a tombstone-shaped event.

```ts
yield *
  UserEntity.delete({ id: '1' }, { forceDelete: 'I know what I am doing' });
```

## Edge cases

- **Soft delete refreshes `_u`.** It is an update under the hood, so
  every `_u`-keyed GSI advances and downstream subscribers wake up.
- **`forceDelete` is a literal string sentinel.** The only value
  accepted is `'I know what I am doing'`; the type is a string-literal
  union so a `true`/`false` boolean does not type-check.
- **Deleting a missing row fails with `NoItemToDelete`.** Both soft and
  hard delete call `get()` first; if the row is absent, the call
  surfaces `DynamodbError.noItemToDelete()` instead of silently
  succeeding.
- **Hard delete bypasses the secondary-index tombstone.** No GSI
  attribute is written — consumers querying GSIs to discover deletions
  will not see this entity disappear cleanly.
- **Hard delete is unsafe for sync engines and stream consumers.**
  Sync engines that rely on `_d: true` propagate deletions to clients;
  they will silently miss a hard delete. DynamoDB Streams emit
  `REMOVE` with no payload, so any consumer that needs the prior
  values to fan out the delete will fail or misbehave.
- **Hard delete still broadcasts a tombstone-shaped entity.** The
  library re-emits the previously-read value with `meta._d = true`,
  so in-process subscribers stay consistent — but downstream
  stream/CDC consumers do not.

## Tests
