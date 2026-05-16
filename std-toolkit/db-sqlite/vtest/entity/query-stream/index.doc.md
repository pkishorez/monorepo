---
title: entity.queryStream
order: 7
---

# entity.queryStream

Cursor-paginated `Stream` of `EntityType<T>[]` batches. Walks an index
until exhausted, advancing the cursor by the last row's `_u` (timeline
SK), the derived SK string (custom SK), or the `idField` value
(primary index). One round-trip per batch.

## Usage

```ts
yield *
  PostEntity.queryStream(
    'byAuthor',
    { pk: { authorId: 'u1' }, sk: { '>': '' } },
    { batchSize: 200 },
  ).pipe(Stream.runForEach((batch) => Effect.log(batch.length)));
```

## API

| Argument    | Type                                                      | Meaning                              |
| ----------- | --------------------------------------------------------- | ------------------------------------ |
| `key`       | `'primary' \| keyof TSecondaryDerivationMap`              | Which index to walk.                 |
| `params`    | `{ pk: …; sk: { '>': string } \| { '<': string } }`       | One open-ended cursor direction.     |
| `options`   | `{ batchSize?: number }`                                  | Rows per round-trip (default `100`). |
| **returns** | `Stream.Stream<EntityType<T>[], SqliteDBError, SqliteDB>` | Lazy paginated stream.               |

## Examples

### Drain everything since a cursor

```ts
yield *
  PostEntity.queryStream('primary', {
    pk: { authorId: 'u1' },
    sk: { '>': lastSeen },
  }).pipe(
    Stream.runForEach((batch) =>
      Effect.forEach(batch, (post) => process(post)),
    ),
  );
```

## Edge cases

- **Only `>` and `<` SK operators are accepted.** Stream needs a
  single cursor direction.
- **`batchSize` defaults to 100.** Each underlying query fetches
  `batchSize` rows.
- **The cursor advances by the LAST item's `_u`** (timeline SK)
  **or `idField` value** (primary index). Strictly after — no
  duplicates.
- **Custom-SK secondary indexes use the resolved SK string as the
  cursor.** For an index whose SK is `["publishedAt"]`, the cursor is
  the derived SK string, not `_u`.
- **Stream terminates when a page returns fewer than `batchSize`
  rows.** No extra round-trip is made; a short page is the
  termination signal.

## Tests

Tests live alongside this doc.
