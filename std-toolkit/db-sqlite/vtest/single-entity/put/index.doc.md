---
title: single-entity.put
order: 2
---

# single-entity.put

Unconditional upsert. Inserts the row if no entry exists; updates in
place if one does. Either way, `_u` is refreshed and the entity is
broadcast through `ConnectionService`.

## Usage

```ts
const written = yield * AppConfig.put({ theme: 'dark', maxRetries: 5 });
written.value; // { theme: 'dark', maxRetries: 5 }
written.meta._u; // fresh ISO timestamp
```

## API

| Argument    | Type                                                          | Meaning                                  |
| ----------- | ------------------------------------------------------------- | ---------------------------------------- |
| `value`     | `Omit<T, '_v'>`                                               | Full payload — partials are not allowed. |
| **returns** | `Effect.Effect<SingleEntityType<T>, SqliteDBError, SqliteDB>` | The stored entity + fresh meta.          |

## Edge cases

- **Caller passes `Omit<T, '_v'>`; library stamps `_v`.** Schema
  version belongs to the schema.
- **First put inserts (no existing row).** The library calls
  `table.getItem` to detect existence, then branches.
- **Second put updates in place (existing row present).** Idempotent
  — the row is rewritten with new `_data`, `_v`, `_u`.
- **`_u` is a fresh ISO timestamp on every put.** Both branches.
- **Returned meta has no `_d` (single-entity has no soft delete).**
  The meta schema is `{ _e, _v, _u }`.

## Tests

Tests live alongside this doc.
