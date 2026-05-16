---
title: command.delete
order: 3
---

# command.delete

`SqliteCommand#process({ operation: 'delete', entity, key })` routes
to `registry.entity(entity).delete(key)` — a **soft** delete — and
wraps the tombstoned `EntityType<T>` with a timing envelope.

## Usage

```ts
const res =
  yield *
  command.process({
    operation: 'delete',
    entity: 'User',
    key: { userId: '1' },
  });
// res.data.meta._d === true
```

## API

| Field       | Type                                                    | Meaning                            |
| ----------- | ------------------------------------------------------- | ---------------------------------- |
| `operation` | `'delete'`                                              | Discriminator.                     |
| `entity`    | `string`                                                | Name of a registered entity.       |
| `key`       | `Record<string, unknown>`                               | Primary-key fields.                |
| **returns** | `Effect.Effect<DeleteResponse, CommandError, SqliteDB>` | `{ data: EntityType<T>, timing }`. |

## Edge cases

- **Delete is soft at the entity layer; the command does not change
  that.** Hard removal is `dangerouslyRemoveAllRows` and is not
  exposed via the command facade.
- **`response.data` is the tombstoned `EntityType<T>`.** The same
  envelope sync consumers see on broadcast.
- **An "Item not found" error maps to `CommandError("delete")`.**
- **Response carries the standard timing envelope.**

## Tests

Tests live alongside this doc.
