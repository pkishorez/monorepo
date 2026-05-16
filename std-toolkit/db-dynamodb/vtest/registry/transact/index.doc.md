---
title: registry.transact
order: 3
---

# registry.transact

Atomic, cross-entity write. Accepts an array of `TransactItem`s
produced by `entity.insertOp` / `entity.updateOp` /
`singleEntity.updateOp`. The type system constrains the entity names
in the array to the registered set, so a typo at the call site fails
to compile.

After DynamoDB acknowledges the transaction, the registry **fans out
broadcasts** in the order the items appear, both through
`ConnectionService.broadcast(...)` and as the Effect's success value.

## Usage

```ts
const insertedUser =
  yield *
  UserEntity.insertOp({
    id: '1',
    email: 'a@b.com',
    name: 'A',
  });
const updatedOrder =
  yield * OrderEntity.updateOp({ id: 'o1' }, { update: { status: 'paid' } });

const broadcasted = yield * registry.transact([insertedUser, updatedOrder]);
broadcasted.length; // 2
```

## API

| Argument    | Type                                                  | Meaning                                                                     |
| ----------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `items`     | `TransactItem<RegisteredName>[]`                      | Builder output from the registered entities only.                           |
| **returns** | `Effect.Effect<EntityType<unknown>[], DynamodbError>` | The broadcast payloads in input order (filtered to items that carried one). |

## Edge cases

- **Atomic — all or nothing.** DynamoDB rejects the whole batch if any
  per-op condition fails. There is no partial success.
- **Broadcasts fire only after the ack.** A rolled-back transaction
  emits nothing through `ConnectionService` and the success value is
  never produced.
- **Items without a `broadcast` payload are skipped in the result.**
  The success value is the array of `broadcast` fields that were
  present, in input order — same length as `items` only when every
  item set `broadcast`.
- **Type-safety is built from the registry's entity set.** Passing a
  `TransactItem` whose `entityName` isn't in the registered union
  fails at compile time, not runtime.
- **`ConnectionService` is optional.** When absent the broadcasts are
  collected and returned but no service emit happens.
- **No retry built in.** DynamoDB throttling / transient failures
  surface as `DynamodbError`; the caller decides how to retry.

## Tests
