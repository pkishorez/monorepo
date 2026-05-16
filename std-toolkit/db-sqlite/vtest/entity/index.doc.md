---
title: SQLiteEntity
order: 2
---

# SQLiteEntity

The multi-record entity layer. A `SQLiteEntity` wraps a `SQLiteTable`
with a schema, an automatic primary-key derivation, zero-or-more
secondary index derivations, a metadata block, and an Effect-typed CRUD
surface. The library writes every key column for you — you never set
`pk`, `sk`, or `IDXnPK/SK` by hand.

This folder breaks the API down **one operation per subfolder**. Each
operation page leads with the description, then enumerates every
caveat / edge case, and ends with the tests that lock that behaviour
down.

## Metadata invariants

Every regular-entity row carries five library-owned fields. The caller
never writes them and cannot evolve them away:

| Field   | Meaning                        | Refreshed on          |
| ------- | ------------------------------ | --------------------- |
| `_e`    | Entity name (from the ESchema) | Insert only           |
| `_v`    | Schema version at write time   | Every write           |
| `_u`    | ISO timestamp                  | **Every write**       |
| `_d`    | Soft-delete tombstone          | `delete()` / explicit |
| `_data` | JSON-encoded entity payload    | Every write           |

> **`_u` is touched on every successful write.** Insert, partial
> update, and soft delete all refresh `_u`. The `_u` field doubles as
> the cursor for any secondary index whose SK is `_u` (the default
> timeline SK), which is what makes `queryStream` and `subscribe`
> work without a separate cursor column.

> **`_d` is `INTEGER 0|1` on disk but `boolean` in the meta.** SQLite
> has no native boolean; the library decodes the column into a real
> `boolean` on read so the entity-facing meta is identical to
> `db-dynamodb`.

## Modules

| Module                                                | Role                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [get](./get/index.doc.md)                             | Read one row by primary-key fields. Returns `EntityType<T>` or `null`.               |
| [insert](./insert/index.doc.md)                       | `putItem` with library-stamped `_e`/`_v`/`_u`/`_d=0` and derived keys.               |
| [update](./update/index.doc.md)                       | Partial merge update. Reads existing, merges, writes — always refreshes `_u`.        |
| [delete](./delete/index.doc.md)                       | Soft delete: writes `_d = 1` and a new `_u` so sync consumers see the tombstone.     |
| [query](./query/index.doc.md)                         | Index-aware query on primary or secondary indexes. Direction inferred from operator. |
| [secondary-indexes](./secondary-indexes/index.doc.md) | Index derivations: timeline-SK vs custom-SK, subscribe restriction.                  |
| [query-stream](./query-stream/index.doc.md)           | Cursor-paginated `Stream` until the index is exhausted.                              |
| [subscribe](./subscribe/index.doc.md)                 | Drain everything after a cursor, then hand off to `ConnectionService`.               |
| [broadcast](./broadcast/index.doc.md)                 | Every successful write emits the entity through `ConnectionService`.                 |

## Correctness story

Each operation folder follows the same shape: description → API table →
examples → numbered edge-case list → tests that match the bullets
verbatim. Tests in this package are **doc-grade**: they exercise the
pure schema / key-derivation / contract layer, not a live SQLite. The
real round-trip tests live under `src/services/__tests__/` and run
against an in-memory `better-sqlite3`.
