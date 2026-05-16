---
title: entity.batchInsert
order: 2
---

# entity.batchInsert

Best-effort batched put. Each row goes through the same `_prepareInsert`
pipeline as a single insert (so `_v` / `_u` / index columns are
populated), then the whole batch is flushed through the underlying
`DynamoTable.batchWrite`. Items that DynamoDB rejects are returned by
**index**, not by value — the caller chooses the retry policy.

## Usage

```ts
const { written, unprocessedIndexes } =
  yield *
  UserEntity.batchInsert([
    { id: '1', email: 'a@b.com', name: 'A' },
    { id: '2', email: 'c@d.com', name: 'C' },
  ]);
```

## API

| Argument    | Type                                                            | Meaning                                          |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `values`    | `InsertInput<T>[]`                                              | The rows to write; each gets a fresh meta block. |
| **returns** | `Effect.Effect<{ written, unprocessedIndexes }, DynamodbError>` | See below.                                       |

### Returned shape

```ts
{
  written: EntityType<T>[];            // every row that DynamoDB acknowledged
  unprocessedIndexes: number[];        // input indexes that came back unprocessed
}
```

## Edge cases

- **No per-row condition.** `batchWrite` is unconditional — there is
  no `attribute_not_exists` check, so a `batchInsert` will overwrite
  an existing row at the same key. Use single `insert` if you need
  collision protection.
- **No broadcast.** Unlike single `insert`, `batchInsert` does not emit
  through `ConnectionService`. Downstream subscribers do not see the
  rows until they are read.
- **`unprocessedIndexes` is positional, not by value.** Indexes are
  into the original `values` array. The caller pairs them back to
  decide which rows to retry.
- **`written` excludes unprocessed indexes.** The returned `written`
  array is the input minus the rejected rows, in original order.
- **No retry built in.** DynamoDB throttling or capacity rejections
  surface as unprocessed indexes; retry policy (backoff, jitter,
  caps) is entirely the caller's choice.
- **Each row still gets its own meta block.** `_v`, `_u`, `_d: false`
  are stamped per row, just like single insert.

## Tests
