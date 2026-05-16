---
title: table.secondary-indexes
order: 3
---

# table.secondary-indexes

`.index(name, pkCol, skCol)` on the builder registers a secondary
index. During `setup()`, two nullable `TEXT` columns are added to the
shared table and a SQLite index is created over them. Querying goes
through `table.index(name).query(...)`.

## Usage

```ts
const table = SQLiteTable.make({ tableName: 't' })
  .primary('pk', 'sk')
  .index('IDX1', 'IDX1PK', 'IDX1SK')
  .build();

const { Items } =
  yield *
  table
    .index('IDX1')
    .query({ pk: 'User#byEmail#a@b.com', sk: { '>': '' } }, { Limit: 50 });
```

## API

| Member                 | Type                                       | Meaning                                            |
| ---------------------- | ------------------------------------------ | -------------------------------------------------- |
| `.index(name, pk, sk)` | builder                                    | Registers a secondary index column pair.           |
| `secondaryIndexMap`    | `Record<name, { pk: string; sk: string }>` | Resolved logical name → column pair.               |
| `.index(name)`         | `{ query(cond, opts?) => Effect }`         | Accessor for queries against this secondary index. |

`KeyConditionParameters` for `.query` is `{ pk: string; sk?:
SortKeyCondition }`. The supported sort-key conditions are `<`,
`<=`, `>`, `>=`, `=`, `between [a, b]`, and `beginsWith`. `between`
uses SQL `BETWEEN`; `beginsWith` becomes `LIKE 'prefix%'`.

## Examples

### Registering two indexes

```ts
SQLiteTable.make({ tableName: 't' })
  .primary('pk', 'sk')
  .index('IDX1', 'IDX1PK', 'IDX1SK')
  .index('IDX2', 'IDX2PK', 'IDX2SK')
  .build();
```

### A `beginsWith` query (timeline prefix)

```ts
yield *
  table
    .index('IDX1')
    .query({ pk: 'Post#byAuthor#u1', sk: { beginsWith: '2025-' } });
```

## Edge cases

- **Index name is independent of pk / sk column names.** The first
  argument is a logical name (used by entities and `.index(name)`); the
  pk / sk arguments are the physical column names.
- **Multiple indexes accumulate in a typed map.** Each `.index(...)`
  widens `secondaryIndexMap`, so referring to an index by name does
  not need a cast.
- **`index(name)` returns an object with a `.query` method.** That
  accessor is the only way to reach secondary-index queries at the
  table layer.
- **`index(name)` throws synchronously for an unknown name.** Wrong
  name is a programmer error; surfaced at the call site, not as a
  SQL error.

## Tests

Tests live alongside this doc and assert the builder / accessor
contract, not live SQLite behaviour.
