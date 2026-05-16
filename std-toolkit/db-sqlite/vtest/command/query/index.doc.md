---
title: command.query
order: 4
---

# command.query

`SqliteCommand#process({ operation: 'query', entity, index, pk, sk,
limit? })` translates the wire `SkCondition` to the entity-layer
`SkParam` and forwards to `entity.query(index, { pk, sk }, options)`.

## Usage

```ts
const res =
  yield *
  command.process({
    operation: 'query',
    entity: 'User',
    index: 'byEmail',
    pk: { email: 'a@b.com' },
    sk: { '>': '' },
    limit: 50,
  });
// res.items: EntityType<User>[]
```

## API

| Field       | Type                                                   | Meaning                                                                             |
| ----------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `operation` | `'query'`                                              | Discriminator.                                                                      |
| `entity`    | `string`                                               | Name of a registered entity.                                                        |
| `index`     | `'primary' \| string`                                  | Primary or a registered secondary index.                                            |
| `pk`        | `Record<string, unknown>`                              | PK fields for the selected index.                                                   |
| `sk`        | `SkCondition`                                          | Same shape as `SkParam` (`<` / `<=` / `=` / `>` / `>=` / `between` / `beginsWith`). |
| `limit`     | `number?`                                              | Optional row cap.                                                                   |
| **returns** | `Effect.Effect<QueryResponse, CommandError, SqliteDB>` | `{ items, timing }`.                                                                |

## Edge cases

- **`payload.index` selects `'primary'` or a secondary index name.**
- **`SkCondition` shapes mirror the entity-layer `SkParam`.** The wire
  format is identical so callers do not translate.
- **`response.items` is a flat array.** No further envelope — just
  `{ items, timing }`.
- **`limit` is forwarded only when defined.** Otherwise the entity
  layer applies its default `100`.
- **Unknown index name surfaces as `CommandError("query")` with cause
  `queryFailed`.**

## Tests

Tests live alongside this doc.
