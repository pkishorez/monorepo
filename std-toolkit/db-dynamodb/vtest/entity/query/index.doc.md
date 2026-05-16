---
title: entity.query
order: 4
---

# entity.query

Reads multiple rows from the primary index or a registered secondary
index. The first argument selects the index by name (`'primary'` or
the semantic GSI name); the second argument supplies the `pk` (typed
against that index's `pkDeps`) and the `sk` operator. Scan direction
is **inferred from the operator** — `>=` / `>` / `beginsWith` scan
forward, `<=` / `<` scan backward.

For the secondary-index variants (timeline SK vs custom SK), see the
[secondary-indexes](./secondary-indexes/index.doc.md) subfolder.

## Usage

```ts
// All rows for a pk, ascending
yield * UserEntity.query('primary', { pk: { id: '1' }, sk: null });

// Cursor / pagination
yield *
  UserEntity.query('primary', {
    pk: { id: '1' },
    sk: { '>': lastCursor },
  });

// Prefix scan
yield *
  UserEntity.query('primary', {
    pk: { id: '1' },
    sk: { beginsWith: '2024-' },
  });

// Streaming pagination
const stream = UserEntity.queryStream('primary', {
  pk: { id: '1' },
  sk: { '>': null },
});
```

## API

| Argument        | Type                                                             | Meaning                                                            |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `key`           | `'primary' \| keyof TSecondaryDerivationMap`                     | Selects the index.                                                 |
| `params.pk`     | `IndexPkValue<T, TPkKeys>` or `Pick<T, ...skDeps>` for secondary | Required for non-zero `pkDeps`; an empty `{}` for entity-only PKs. |
| `params.sk`     | `SkParam` or `CustomSkParam<T, SkKeys>`                          | `null` = no SK condition; operator object = condition.             |
| `options.limit` | `number`                                                         | DynamoDB `Limit`; the query terminates at the first matching page. |
| **returns**     | `Effect.Effect<{ items: EntityType<T>[] }, DynamodbError>`       | All decoded rows for the page.                                     |

### `SkParam` operators

| Form                         | Direction | Notes                                                            |
| ---------------------------- | --------- | ---------------------------------------------------------------- |
| `null`                       | forward   | "No SK condition".                                               |
| `{ '>=': v }` / `{ '>': v }` | forward   | Inclusive / exclusive lower bound.                               |
| `{ '<=': v }` / `{ '<': v }` | backward  | Inclusive / exclusive upper bound (scan reverses automatically). |
| `{ beginsWith: 'prefix' }`   | forward   | DynamoDB `begins_with` on the SK.                                |

## Examples

### Range scan with limit

```ts
yield *
  UserEntity.query(
    'primary',
    { pk: { id: '1' }, sk: { '>=': '2024-01' } },
    { limit: 50 },
  );
```

### Streaming pagination

`queryStream` only accepts `>` / `<` (exclusive operators) because the
cursor must be a strict boundary, and yields cumulative batches of
size `batchSize` (default 100):

```ts
import { Stream } from 'effect';

yield *
  UserEntity.queryStream(
    'primary',
    { pk: { id: '1' }, sk: { '>': null } },
    { batchSize: 25 },
  ).pipe(Stream.runForEach((batch) => Effect.log(batch.length)));
```

## Edge cases

- **Scan direction is inferred from the operator.** You never set
  `ScanIndexForward` directly. `<` / `<=` flip the direction; the
  rest scan forward.
- **`sk: null` means "no SK condition".** It is not a cursor reset to
  a sentinel value; it asks DynamoDB for the page with no SK
  predicate.
- **Empty-pk entities use `{}` for `pk`.** When `primary({ pk: [] })`
  was declared, the `pk` argument is typed as `{}` and the partition
  key is just the entity name.
- **An unknown secondary index name fails with `queryFailed`.** The
  library does the lookup against `secondaryDerivationMap`; a missing
  key surfaces as `DynamodbError.queryFailed('Index <name> not
found')`.
- **Soft-deleted rows are returned.** Query has no awareness of `_d`;
  callers filter tombstones if they want to.
- **`queryStream` terminates when a page returns fewer items than
  `batchSize`.** It does **not** rely on `LastEvaluatedKey` — instead
  the next cursor is read off the last decoded item (the `idField`
  for primary, the timeline `_u` for `_u`-SK GSIs, or the derived
  custom-SK string for custom-SK GSIs).
- **`queryStream` cannot use `beginsWith` / `>=` / `<=`.** Only `>`
  (forward) and `<` (backward) are supported because the cursor has
  to be exclusive.

## Tests
