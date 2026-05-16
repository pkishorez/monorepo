---
title: singleEntity.update
order: 3
---

# singleEntity.update

Updates the single row. Like `DynamoEntity.update`, accepts either a
plain partial object or an expression-builder callback. The library
**always refreshes `_u`** and version-locks the update against `_v =
latestVersion`.

## Usage

```ts
yield * AppConfig.update({ update: { theme: 'dark' } });
yield * Counter.update({ update: ($) => [$.add('count', 1)] });
```

## API

| Argument           | Type                                         | Meaning                                       |
| ------------------ | -------------------------------------------- | --------------------------------------------- |
| `params.update`    | `Partial<Omit<T, '_v'>>` or builder callback | Partial value or `$.set` / `$.add` / etc.     |
| `params.condition` | `ConditionInput<T>`                          | Extra condition AND-ed with the version lock. |
| **returns**        | `Effect<SingleEntityType<T>, DynamodbError>` | The updated value (ALL_NEW).                  |

## Edge cases

- **No row → `noItemToUpdate`.** Single entities still have an
  underlying DynamoDB row; if it has never been written (i.e. `get`
  would have returned the default), an `update` fails with
  `noItemToUpdate`. Call `put` first to create the row.
- **With user condition → `conditionCheckFailed`.** Same mapping as
  `DynamoEntity.update`: the library cannot distinguish "row missing"
  from "user condition false" once a user condition is supplied.
- **`_u` is always refreshed.** Every update appends `SET _u = :iso`.
- **Version-locked on `_v`.** The condition AND-s `_v = latest`. A
  stale `_v` row fails the conditional until it has been migrated.
- **No `_d` to set.** Single entities have no soft-delete; `_d` is
  silently absent from the meta schema.

## Tests
