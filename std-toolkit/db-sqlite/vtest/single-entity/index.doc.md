---
title: SQLiteSingleEntity
order: 3
---

# SQLiteSingleEntity

A simplified entity for **exactly one row** per name — application
config, feature flags, counters, the "current user", and so on. Both
`pk` and `sk` are derived from the entity name only, so there is no
choice of key field; the row either exists or it doesn't.

The single difference from `db-dynamodb`'s single-entity is the
**mandatory default value**: `SQLiteSingleEntity.make(...).default(v)`
is required, and `get()` returns the default — _with synthetic
meta where `_u === ''`_ — when the row is absent. Callers never have
to handle `null`.

## Why it exists

A regular `SQLiteEntity` always needs an id and an at-least-zero-row
contract. A lot of configuration data is "exactly one row, always
exists, has a sensible default":

```ts
const AppConfig = SQLiteSingleEntity.make(table)
  .eschema(configSchema)
  .default({ theme: 'light', maxRetries: 3 });

const cfg = yield * AppConfig.get(); // value.theme always defined
```

This folder documents `get` / `put` / `update` as separate operations
because each has its own contract (synthetic vs. stored meta, upsert
semantics, "must exist" check).

## Modules

| Module                          | Role                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| [get](./get/index.doc.md)       | Never returns `null` — returns the default with `_u === ''` if no row. |
| [put](./put/index.doc.md)       | Upsert. Inserts if absent, updates if present. Refreshes `_u`.         |
| [update](./update/index.doc.md) | Partial merge. Fails with `updateFailed` if the row doesn't exist yet. |

## Correctness story

Each operation folder follows the same shape as the entity folder:
description → API → examples → edge-case bullets → matching tests.
The interesting case is `get`'s "synthetic meta": `_u === ''` is the
in-band signal that nothing has been written, which is what `update`
checks before failing.
