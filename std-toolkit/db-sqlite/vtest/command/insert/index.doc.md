---
title: command.insert
order: 1
---

# command.insert

`SqliteCommand#process({ operation: 'insert', entity, data })` routes
the payload to `registry.entity(entity).insert(data)` and wraps the
returned `EntityType<T>` in a response envelope with timing.

## Usage

```ts
const res =
  yield *
  command.process({
    operation: 'insert',
    entity: 'User',
    data: { userId: '1', email: 'a@b.com', name: 'A' },
  });
// { operation: 'insert', entity: 'User', data: EntityType<User>, timing }
```

## API

| Field       | Type                                                    | Meaning                           |
| ----------- | ------------------------------------------------------- | --------------------------------- |
| `operation` | `'insert'`                                              | Discriminator.                    |
| `entity`    | `string`                                                | Name of a registered entity.      |
| `data`      | `Omit<T, '_v'>`                                         | Payload — caller never sets `_v`. |
| **returns** | `Effect.Effect<InsertResponse, CommandError, SqliteDB>` | Response with `{ data, timing }`. |

## Edge cases

- **`response.operation` echoes the request operation tag.** The
  literal string is what downstream code switches on.
- **`response.data` is the `EntityType<T>` returned by
  `entity.insert`.** The command processor does not reshape it.
- **`timing` has `startedAt`, `completedAt`, `durationMs`.**
  Identical envelope across every operation.
- **Unknown entity throws synchronously, not via `CommandError`.**
  `#getEntity(name)` is invoked outside the `Effect.gen` body.
- **Entity-level errors are wrapped as `CommandError`.** Insert
  failures (encode error, SQL error) are mapped into `CommandError`
  with the operation tag and the original cause.

## Tests

Tests live alongside this doc.
