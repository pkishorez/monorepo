---
title: EntityRegistry
order: 4
---

# EntityRegistry

The registry binds N entities to a **single shared SQLite table** and
owns the cross-entity primitives: `setup`, transactional execution, and
the schema descriptor used by `SqliteCommand`.

A registry is **append-only at build time**: you `.register(entity)` /
`.registerSingle(entity)` to accumulate a typed map, then `.build()`
once. The built registry exposes those entities by name (`registry
.entity('User')`) preserving full inference.

## Why the registry, not standalone entities?

- **Shared `setup()`.** Every secondary index requested by any
  registered entity becomes a column on the shared table during one
  idempotent `setup()` call. You don't manage migrations entity by
  entity.
- **One transaction boundary.** `registry.transaction(effect)` is the
  only way to issue a multi-write SQLite transaction in this package.
  Broadcasts from the writes inside it are buffered in a `FiberRef`
  and flushed on commit (and dropped on rollback).
- **Unified descriptor.** `registry.getSchema()` returns the
  `RegistrySchema` consumed by the JSON-facade command processor and
  by RPC clients that need to know which indexes exist.

## `transaction(effect)` vs DynamoDB's `transact([ops])`

This is the one place the API intentionally diverges from
`@std-toolkit/db-dynamodb`. DynamoDB's `transact` takes an array of
declarative ops because the underlying API is a single
`TransactWriteItems` call. SQLite has a real `BEGIN` / `COMMIT`, so the
registry takes an arbitrary `Effect` and wraps it in the SQLite
transaction:

```ts
yield *
  registry.transaction(
    Effect.gen(function* () {
      yield* UserEntity.insert({ userId: '1', email: 'a@b', name: 'A' });
      yield* PostEntity.insert({
        postId: 'p1',
        authorId: '1',
        title: 'Hi',
        content: '',
      });
    }),
  );
```

Either both writes commit, or neither does — and the two `_broadcast`
calls are buffered until `COMMIT` succeeds.

## Modules

| Module                                    | Role                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| [register](./register/index.doc.md)       | Builder: `.register(entity)` / `.registerSingle(entity)` / `.build()`.        |
| [transaction](./transaction/index.doc.md) | `transaction(effect)`: SQLite `BEGIN`/`COMMIT`/`ROLLBACK` + broadcast buffer. |

## Correctness story

The registry exposes very few methods on purpose. The complexity of
"keep N entities consistent" is pushed into the entity layer (which
owns key derivation and `_u` stamping) and into SQLite (which owns
atomicity). The registry's contribution is the broadcast buffer:
without it, a successful `entity.update()` inside a transaction that
later rolls back would have already fired its `service.broadcast(...)`,
and downstream subscribers would believe in a write that never landed.
