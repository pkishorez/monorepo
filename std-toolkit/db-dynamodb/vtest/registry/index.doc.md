---
title: EntityRegistry
order: 3
---

# EntityRegistry

A typed registry of `DynamoEntity` and `DynamoSingleEntity` instances
that share a single `DynamoTable`. The registry owns three things that
no individual entity can:

1. **Cross-entity transactions** — `registry.transact([...])` validates
   every `TransactItem` against the registered set and broadcasts the
   resulting entities together.
2. **Schema migration scans** — `registry.migrate()` walks the entire
   table, classifies every row, and (optionally) rewrites stale ones.
3. **A unified descriptor surface** — `getSchema()` returns the
   `RegistrySchema` consumed by the trace viewer and other tooling.

## Modules

| Module                              | Role                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------- |
| [register](./register/index.doc.md) | Builder steps: `.register(entity)`, `.registerSingle(entity)`, `.build()`. |
| [transact](./transact/index.doc.md) | Type-safe cross-entity transactions with post-ack broadcast.               |
| [migrate](./migrate/index.doc.md)   | Parallel-segment scan + conditional rewrite of stale rows.                 |
