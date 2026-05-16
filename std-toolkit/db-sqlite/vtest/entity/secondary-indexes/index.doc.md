---
title: entity.secondary-indexes
order: 6
---

# entity.secondary-indexes

`.index(tableIndexName, entityIndexName, { pk, sk? })` on the entity
builder declares which schema fields contribute to each secondary
index. The library writes `<IDX>PK` / `<IDX>SK` for you on every put,
and refreshes them on every update — including soft delete.

## Usage

```ts
SQLiteEntity.make(table)
  .eschema(userSchema)
  .primary()
  .index('IDX1', 'byEmail', { pk: ['email'] }) // timeline SK
  .index('IDX2', 'byEmailExact', { pk: ['email'], sk: ['createdAt'] })
  .build();
```

## API

| Argument          | Type                                              | Meaning                                         |
| ----------------- | ------------------------------------------------- | ----------------------------------------------- |
| `tableIndexName`  | `keyof TTable['secondaryIndexMap']`               | Must match a `.index(...)` on the table.        |
| `entityIndexName` | `string`                                          | The semantic name (used in `query(name, ...)`). |
| `derivation.pk`   | `readonly (keyof T \| '_u')[]`                    | Fields used to build `IDXnPK`.                  |
| `derivation.sk`   | `readonly (keyof T \| '_u')[]` (default `['_u']`) | Fields used to build `IDXnSK`.                  |

PK pattern: `<EntityName>#<entityIndexName>#<dep1>#<dep2>…`
SK pattern: `<EntityName>#<dep1>#<dep2>…` (no `entityIndexName`
prefix — the SK namespace is per-entity, not per-index).

## Examples

### Two entities sharing one table-level index

```ts
SQLiteEntity.make(table)
  .eschema(userSchema)
  .primary()
  .index('IDX1', 'byEmail', { pk: ['email'] })
  .build();

SQLiteEntity.make(table)
  .eschema(postSchema)
  .primary({ pk: ['authorId'] })
  .index('IDX1', 'byAuthor', { pk: ['authorId'] })
  .build();
```

Both write `IDX1PK` / `IDX1SK`, but with different PK prefixes
(`User#byEmail#…` vs `Post#byAuthor#…`), so a query against one entity
can't accidentally pick up the other's rows.

## Edge cases

- **SK defaults to `["_u"]` when not specified.** Most secondary
  indexes are "give me the latest N rows for this PK", so the
  timeline SK is the default.
- **`isTimelineSk` is true iff `sk` is exactly `["_u"]`.** The
  library tracks this at the type level: only timeline-SK indexes can
  back `subscribe(...)`.
- **PK pattern is `<EntityName>#<entityIndexName>#<deps...>`.**
  Multiple entities sharing a table-level index live in disjoint key
  spaces; the entity name prefix is the boundary.
- **Custom SK uses the entity-name prefix (not the entity#index
  prefix).** Only the PK gets the per-index namespace; the SK is
  shared across indexes for the same entity.
- **`subscribe(...)` only accepts indexes where `isTimelineSk` is
  true.** A custom-SK index has no meaningful "since cursor"; the
  type system refuses the call at the boundary.

## Tests

Tests live alongside this doc.
