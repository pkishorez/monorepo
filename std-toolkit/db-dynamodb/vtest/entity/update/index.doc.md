---
title: entity.update
order: 5
---

# entity.update

Updates an existing row by its primary-key fields. Accepts either a
plain partial object (`{ update: { name: 'B' } }`) or an expression
builder callback (`{ update: $ => [$.add('score', 5)] }`). The library
**always refreshes `_u`** and writes/refreshes derived index columns
for the keys you touched.

## Usage

```ts
// Partial-object update
const updated =
  yield * UserEntity.update({ id: '1' }, { update: { name: 'B' } });

// Expression-builder update
yield *
  PlayerEntity.update(
    { teamId: 't', playerId: 'p' },
    { update: ($) => [$.add('score', 5), $.appendList('history', ['kick'])] },
  );
```

## API

| Argument           | Type                                                         | Meaning                                                         |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------- |
| `keyValue`         | `IndexPkValue<T, TPrimaryPkKeys> & Pick<T, idField>`         | Fields that derive the primary `pk` + `sk`.                     |
| `params.update`    | `Partial<Omit<T, '_v'>>` **or** `(ops) => AnyOperation<T>[]` | Partial value, or a builder callback for ADD/REMOVE/APPEND/etc. |
| `params.condition` | `ConditionInput<T>`                                          | Extra condition AND-ed with the version lock.                   |
| **returns**        | `Effect.Effect<EntityType<T>, DynamodbError>`                | The post-update row (`ReturnValues: ALL_NEW`).                  |

## Examples

### Soft-delete via partial

```ts
yield * UserEntity.update({ id: '1' }, { update: { _d: true } });
```

This is what `delete()` does internally. `_d` is the one meta field you
are allowed to set through a partial.

### Expression builder for counters

```ts
yield *
  PlayerEntity.update(
    { teamId: 't', playerId: 'p' },
    { update: ($) => [$.add('score', 5), $.set('lastLogin', now)] },
  );
```

## Edge cases

- **Every update refreshes `_u`.** The library appends `$.set('_u',
newIso)` to the user's expression. This is what advances the
  timeline-SK cursor on every `_u`-keyed GSI.
- **Every update is version-locked.** The library AND-s
  `$.cond('_v', '=', latestVersion)` onto the condition. If a stored
  row carries an older `_v`, the update fails — call `migrate` first
  or rewrite the row.
- **No condition, no row → `NoItemToUpdate`.** Without a user
  condition, a `ConditionalCheckFailed` means "the row didn't exist"
  and surfaces as `DynamodbError.noItemToUpdate()`. With a user
  condition, the same low-level failure maps to
  `DynamodbError.conditionCheckFailed()` because both states are
  indistinguishable to DynamoDB.
- **Updating a derivation dependency via expression builder is
  rejected.** If any key/path in your builder ops touches a field
  that contributes to an index PK or SK, the call fails fast with
  `UpdateItemFailed` / `/derivation dependency/`. Use a plain partial
  instead — the partial path recomputes the derived columns.
- **Partial updates strip `_e` and `_v` from the input.** Callers may
  technically include them; the library drops them before encoding so
  the meta block stays library-owned.
- **`_d` is permitted in a partial update.** Setting `_d: true` is how
  soft delete is implemented; the partial path also writes `_d` into
  the encoded item explicitly.
- **Secondary index columns are recomputed.** A partial update derives
  every GSI key that depends on the touched fields and writes the new
  values in the same `UpdateItem`. Index attributes you never
  declared remain untouched.

## Tests
