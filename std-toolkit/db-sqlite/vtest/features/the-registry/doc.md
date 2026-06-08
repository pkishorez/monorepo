# The registry

Single-table design means many entities live on _one_ table. The
`EntityRegistry` is what gathers them: you register each entity once, and the
registry becomes the single place to set the table up, look entities up by name,
and run multi-entity work atomically.

```ts
const registry = EntityRegistry.make(table)
  .register(userEntity)
  .register(postEntity)
  .registerSingle(appConfig)
  .build();

yield * registry.setup(); // create the shared table + all indexes, once
```

Entities are keyed by their schema name: `registry.entity('User')` returns the
exact instance you registered, fully typed. `registry.entityNames` lists them
all. Because every entity carves out its own keyspace, two of them sharing one
physical table never collide.

::test-group{id=one-table-many-entities}

## Atomic, multi-entity work

A write often spans entities — create a user _and_ their first post, all-or-
nothing. `registry.transaction(effect)` runs the effect inside a SQLite
transaction: commit on success, roll back on any failure. Broadcasts to live
subscribers are buffered until commit, so observers never see half a transaction.

::test-group{id=transactions}
