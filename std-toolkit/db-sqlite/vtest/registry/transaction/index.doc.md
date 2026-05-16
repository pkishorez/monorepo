---
title: registry.transaction
order: 2
---

# registry.transaction

Wraps an arbitrary `Effect` in a SQLite `BEGIN`/`COMMIT`/`ROLLBACK`
boundary. Writes performed by registered entities inside the effect
buffer their broadcasts in the `TransactionPendingBroadcasts`
`FiberRef`; on commit, the buffer is flushed in insertion order. On
rollback, the buffer is dropped.

> This is the **only** way to issue a multi-write SQLite transaction
> in this package. There is no `entity.transactionalUpdate(...)`; cross
> -entity atomicity always lives at the registry.

## Usage

```ts
yield *
  registry.transaction(
    Effect.gen(function* () {
      yield* UserEntity.insert({ userId: '1', email: 'a@b', name: 'A' });
      yield* AuditEntity.insert({
        auditId: 'a1',
        actor: 'system',
        action: 'created',
      });
    }),
  );
```

## API

| Argument    | Type                                                  | Meaning                                          |
| ----------- | ----------------------------------------------------- | ------------------------------------------------ |
| `effect`    | `Effect.Effect<A, E, R>`                              | Any Effect — typically a `gen` of entity writes. |
| **returns** | `Effect.Effect<A, E \| SqliteDBError, R \| SqliteDB>` | The inner result; failure rolls back.            |

## Why not `transact([ops])`?

`@std-toolkit/db-dynamodb`'s `transact` takes an array of declarative
ops because DynamoDB's underlying API is a single
`TransactWriteItems` call. SQLite has a real `BEGIN`/`COMMIT`, so the
registry takes an arbitrary `Effect` — you get for-loops, conditionals,
read-then-write, and any other control flow for free.

## Edge cases

- **`BEGIN` runs before the effect, `COMMIT` runs only on success.**
  The library uses `Effect.acquireUseRelease`.
- **Effect failure triggers `ROLLBACK`, not `COMMIT`.** Errors from
  the inner effect propagate out; SQL state ends where it started.
- **Nested transactions fail with `nestedTransactionNotSupported`.**
  The library refuses to nest — flatten or split the call.
- **Writes inside the transaction buffer broadcasts in a `FiberRef`.**
  The entity's `_broadcast` helper checks `TransactionPendingBroadcasts`
  and appends instead of emitting.
- **On commit, buffered broadcasts flush in insertion order.**
- **On rollback, the buffer is dropped and never emitted.**
- **`FiberRef` is reset to `none` after the transaction.** No leaked
  state survives.

## Tests

Tests live alongside this doc.
