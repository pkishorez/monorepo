---
title: DynamoSingleEntity
order: 1
---

# DynamoSingleEntity

A simplified entity for **single-record** state: app config, feature
flags, counters, "the current value of X". The PK and SK are both
derived from the entity name (a constant), so the whole entity is one
row. `get` is total — there is no `null` case — because the builder
takes a mandatory **default value**.

## Metadata invariants

Single entities carry only three meta fields. There is no `_d`
(soft-delete makes no sense for a single-row entity).

| Field | Refreshed on |
| ----- | ------------ |
| `_e`  | Insert only  |
| `_v`  | Every write  |
| `_u`  | Every write  |

## Modules

| Module                          | Role                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| [get](./get/index.doc.md)       | Total read — falls back to the configured default if the row is absent. |
| [put](./put/index.doc.md)       | Unconditional upsert; stamps `_v` and `_u`.                             |
| [update](./update/index.doc.md) | Partial or expression-builder update; version-locked on `_v`.           |
