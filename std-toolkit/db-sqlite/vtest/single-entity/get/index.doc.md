---
title: single-entity.get
order: 1
---

# single-entity.get

Returns the single row decoded from the database, or — if no row has
been written yet — the configured default value with **synthetic meta
where `_u === ''`**. Never returns `null`.

## Usage

```ts
const cfg = yield * AppConfig.get();
cfg.value.theme; // always defined
cfg.meta._u; // '' if never written, otherwise an ISO timestamp
```

## API

| Member                                             | Type                                                          | Meaning                                          |
| -------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| `SQLiteSingleEntity.make(t).eschema(s).default(v)` | builder                                                       | The default value is mandatory.                  |
| `get()`                                            | `Effect.Effect<SingleEntityType<T>, SqliteDBError, SqliteDB>` | `{ value, meta: { _e, _v, _u } }`. Never `null`. |

## Examples

### Bootstrapping config without an existence check

```ts
const AppConfig = SQLiteSingleEntity.make(table)
  .eschema(configSchema)
  .default({ theme: 'light', maxRetries: 3 });

const cfg = yield * AppConfig.get(); // safe, returns default if absent
yield * Effect.log(cfg.value.theme);
```

### Distinguishing default from stored

```ts
const cfg = yield * AppConfig.get();
if (cfg.meta._u === '') {
  // never persisted yet
}
```

## Edge cases

- **Never returns `null`.** Callers do not need to handle the missing
  case — that's the whole point of single-entity.
- **`meta._u === ''` signals "default, not stored".** `update(...)`
  uses the same signal to decide whether to fail with
  `updateFailed("Item not found")`.
- **Synthetic meta carries the schema's `latestVersion`.** When no row
  exists, the library still stamps `_v = schema.latestVersion`.
- **Real stored rows have a non-empty `_u`.** After the first
  `put(...)` / `update(...)`, `_u` is an ISO timestamp.
- **`pk` and `sk` are both derived from the entity name only.** A
  single-entity has exactly one row.

## Tests

Tests live alongside this doc.
