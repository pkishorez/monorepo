# The registry

Single-table design means many entities live on _one_ table. The
`EntityRegistry` is what gathers them: you register each entity once, and the
registry becomes the single place to look entities up by name and to run
multi-entity work atomically.

```ts
const registry = EntityRegistry.make(table)
  .register(userEntity)
  .register(orderEntity)
  .registerSingle(appConfig)
  .build();
```

Entities are keyed by their schema name: `registry.entity('User')` returns the
exact instance you registered, fully typed. `registry.entityNames` lists them
all. Because every entity carves out its own keyspace, two of them sharing one
physical table never collide.

::test-group{id=one-table-many-entities}

## Atomic, multi-entity work

A write often spans entities — create a user _and_ their first order, all-or-
nothing. Each entity exposes `insertOp` / `updateOp` that build a **transaction
item** instead of executing immediately; `registry.transact([...])` hands them to
DynamoDB's `TransactWriteItems`, which commits every write together or none at
all. Broadcasts to live subscribers fire only after the transaction commits, so
observers never see half a transaction.

```ts
yield *
  registry.transact([
    yield * userEntity.insertOp({ userId: 'u1', name: 'Ada' }),
    yield * orderEntity.insertOp({ userId: 'u1', orderId: 'o1', total: 10 }),
  ]);
```

::test-group{id=transactions}
