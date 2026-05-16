---
title: DynamoEntity
order: 2
---

# DynamoEntity

The multi-record entity layer. A `DynamoEntity` wraps a `DynamoTable` with
a schema, an automatic primary-key derivation, zero-or-more secondary
index derivations, a metadata block, and an Effect-typed CRUD surface.
The library writes every key column for you — you never set `pk`, `sk`,
or `GSInPK/SK` by hand.

This folder breaks the API down **one operation per subfolder**. Each
operation page leads with the description, then enumerates every
caveat / edge case, and ends with the tests that lock that behaviour
down.

## Metadata invariants

Every regular-entity row carries four library-owned fields. The caller
never writes them and cannot evolve them away:

| Field | Meaning                           | Refreshed on          |
| ----- | --------------------------------- | --------------------- |
| `_e`  | Entity name (from the ESchema)    | Insert only           |
| `_v`  | Schema version at write time      | Every write           |
| `_u`  | ISO timestamp                     | **Every write**       |
| `_d`  | Soft-delete tombstone (`boolean`) | `delete()` / explicit |

> **`_u` is touched on every successful write.** Insert, update,
> partial / expression-builder update, and soft delete all refresh
> `_u`. Hard delete is the one exception — the row is gone, so there
> is no `_u` to refresh. The `_u` field doubles as the cursor for any
> secondary index whose SK is `_u` (the default timeline SK).

## Modules

| Module                                                              | Role                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [get](./get/index.doc.md)                                           | Read one row by primary-key fields. Returns `EntityType<T>` or `null`.               |
| [insert](./insert/index.doc.md)                                     | Conditional put: fails if the key already exists. Always stamps `_v`/`_u`.           |
| [update](./update/index.doc.md)                                     | Partial or expression-builder update. Always refreshes `_u`. Locks on schema `_v`.   |
| [delete](./delete/index.doc.md)                                     | Soft delete by default (`_d: true` + new `_u`). Hard delete is opt-in.               |
| [query](./query/index.doc.md)                                       | Index-aware query on primary or secondary indexes. Direction inferred from operator. |
| [query / secondary-indexes](./query/secondary-indexes/index.doc.md) | GSIs: timeline-SK vs custom-SK derivation, subscribe restriction.                    |
| [batch-insert](./batch-insert/index.doc.md)                         | Best-effort batch put with `unprocessedIndexes` for caller-driven retry.             |
| [transactions](./transactions/index.doc.md)                         | `insertOp` / `updateOp` builders for cross-entity `registry.transact`.               |
| [schema-evolution](./schema-evolution/index.doc.md)                 | `.evolve()` adds a version; old rows decode into the latest shape on read.           |
| [migration](./migration/index.doc.md)                               | `inspectMigration` / `migrationWriteIntent` classify and rewrite drifted rows.       |
| [broadcast](./broadcast/index.doc.md)                               | Every write emits the resulting entity through `ConnectionService`.                  |

## Correctness story

Each operation folder follows the same shape: description → API table →
examples → numbered edge-case list → tests that match the bullets
verbatim. Tests in this package are **doc-grade**: they exercise the
pure expression-builder / schema layer that produces the DynamoDB
request payload, not a live DynamoDB. The real round-trip tests live
under `src/__tests__/` and run against a local DynamoDB.
