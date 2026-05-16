---
title: SQLiteTable
order: 1
---

# SQLiteTable

The substrate layer. A `SQLiteTable` owns the physical layout of the
single shared SQLite table: the primary `(pk, sk)` composite key, zero
or more secondary index column pairs, and the seven library-owned
columns (`_data`, `_e`, `_v`, `_u`, `_d` plus the index columns).

Application code rarely calls `SQLiteTable` directly; it goes through
`SQLiteEntity`. The table API is documented here because every entity
operation reduces to a `getItem` / `putItem` / `updateItem` /
`query` call on it, and the column / index lifecycle (idempotent
`setup`, additive secondary-index columns) is what makes
"add an entity, redeploy" safe.

## Single-table column layout

| Column          | Type                 | Owner   | Purpose                                              |
| --------------- | -------------------- | ------- | ---------------------------------------------------- |
| `pk`            | `TEXT` (primary)     | library | Partition key — derived by the entity                |
| `sk`            | `TEXT` (primary)     | library | Sort key — the entity `idField`                      |
| `_data`         | `TEXT`               | library | JSON-encoded entity payload                          |
| `_e`            | `TEXT`               | library | Entity name (from the ESchema)                       |
| `_v`            | `TEXT`               | library | Schema version at write time                         |
| `_u`            | `TEXT`               | library | ISO timestamp — refreshed on every write             |
| `_d`            | `INTEGER` (def. `0`) | library | Soft-delete tombstone (`1` = deleted)                |
| `<IDXn>PK / SK` | `TEXT` (nullable)    | library | One pair per secondary index, added during `setup()` |

> **`setup()` is idempotent and additive.** Re-running it on an
> existing table is a no-op for the table itself, but it _adds_ any
> secondary index columns that weren't there before (and creates the
> matching SQLite index). You never write a migration to introduce a
> new secondary index — register the entity / index, redeploy, call
> `setup()`.

## Modules

| Module                                                | Role                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| [setup](./setup/index.doc.md)                         | `setup()` — create table, add missing index columns + indexes.  |
| [primary-key](./primary-key/index.doc.md)             | Composite `(pk, sk)` primary key — what the table guarantees.   |
| [secondary-indexes](./secondary-indexes/index.doc.md) | `.index(name, pk, sk)` builder + `.index(name).query(...)` API. |

## Correctness story

The table is a deliberately small substrate: every operation is either a
SQLite DDL statement (idempotent `CREATE IF NOT EXISTS`, additive
`ALTER TABLE ADD COLUMN`) or a single `SELECT` / `INSERT` / `UPDATE`
against the shared row layout. The entity layer is where the
schema-aware behaviour (encoding, key derivation, broadcast) lives.
