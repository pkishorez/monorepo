---
title: command.update
order: 2
---

# command.update

`SqliteCommand#process({ operation: 'update', entity, key, data })`
routes to `registry.entity(entity).update(key, data)` and wraps the
merged result with a timing envelope.

## Usage

```ts
const res =
  yield *
  command.process({
    operation: 'update',
    entity: 'User',
    key: { userId: '1' },
    data: { name: 'A2' },
  });
```

## API

| Field       | Type                                                    | Meaning                            |
| ----------- | ------------------------------------------------------- | ---------------------------------- |
| `operation` | `'update'`                                              | Discriminator.                     |
| `entity`    | `string`                                                | Name of a registered entity.       |
| `key`       | `Record<string, unknown>`                               | Primary-key fields.                |
| `data`      | `Partial<Omit<T, '_v'>>`                                | Fields to merge.                   |
| **returns** | `Effect.Effect<UpdateResponse, CommandError, SqliteDB>` | `{ data: EntityType<T>, timing }`. |

## Edge cases

- **Payload carries both `key` and `data`.** Unlike `insert`, the
  update payload separates the primary-key fields from the merge
  payload.
- **`response.data` is the `EntityType<T>` after the merge.** The
  processor returns what `entity.update` returned — merged value +
  fresh meta.
- **An "Item not found" error maps to `CommandError("update")`.**
  The entity-layer error (`updateFailed`) is wrapped with the
  original cause attached.
- **Timing is only present on the success response.** The error
  path returns a typed `CommandError`; parity with `DynamoCommand`.

## Tests

Tests live alongside this doc.
