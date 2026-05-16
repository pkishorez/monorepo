---
title: entity.query
order: 5
---

# entity.query

Index-aware SQL query. `key === 'primary'` targets the primary index;
any other key is a secondary index name on the entity. Direction is
inferred from the SK operator (`<` / `<=` → DESC, everything else →
ASC) unless overridden by an option.

## Usage

```ts
const { items } =
  yield *
  UserEntity.query(
    'byEmail',
    { pk: { email: 'a@b.com' }, sk: { '>': '' } },
    { limit: 50 },
  );
```

## API

| Argument    | Type                                                                 | Meaning                                    |
| ----------- | -------------------------------------------------------------------- | ------------------------------------------ |
| `key`       | `'primary' \| keyof TSecondaryDerivationMap`                         | Which index to query.                      |
| `params`    | `{ pk: …; sk: SkParam }`                                             | Partition-key fields + sort-key condition. |
| `options`   | `{ limit?: number }`                                                 | Optional row cap (default `100`).          |
| **returns** | `Effect.Effect<{ items: EntityType<T>[] }, SqliteDBError, SqliteDB>` | Decoded items wrapped in `{ items }`.      |

`SkParam` is one of: `{ '<': v }`, `{ '<=': v }`, `{ '>': v }`,
`{ '>=': v }`, `{ '=': v }`, `{ between: [a, b] }`, `{ beginsWith: p }`.

## Examples

### Primary-index range scan

```ts
yield *
  PostEntity.query('primary', {
    pk: { authorId: 'u1' },
    sk: { beginsWith: 'p' },
  });
```

### Secondary timeline scan (newest first)

```ts
yield *
  PostEntity.query(
    'byAuthor',
    { pk: { authorId: 'u1' }, sk: { '<': cursor } },
    { limit: 20 },
  );
```

## Edge cases

- **SK operator selects the comparator and the direction.** `>` /
  `>=` → ASC; `<` / `<=` → DESC; `between` / `beginsWith` keep ASC.
- **`limit` defaults to 100 when not specified.** Bare queries never
  return the full table by accident.
- **`between [a, b]` becomes `BETWEEN a AND b`** — both ends
  inclusive.
- **`beginsWith` prefix becomes `LIKE "prefix%"`** — used for
  timeline-prefix queries.
- **Returns `{ items: EntityType<T>[] }`, never a flat array.** The
  envelope matches `db-dynamodb`.
- **Unknown secondary index name fails with `queryFailed`.** A typed
  error, not an exception.

## Tests

Tests live alongside this doc.
