---
title: entity.insertOp / updateOp
order: 7
---

# entity.insertOp / updateOp

Builders that produce a `TransactItem` ready for
[`registry.transact`](../../registry/transact/index.doc.md). They go
through the same prepare pipelines as `insert` / `update` (key
derivation, `_v` / `_u`, condition AND-ing), so a transacted write
behaves identically to a direct write — minus the immediate broadcast
side-effect.

## Usage

```ts
const aOp =
  yield * UserEntity.insertOp({ id: '1', email: 'a@b.com', name: 'A' });
const bOp =
  yield * OrderEntity.updateOp({ id: 'o1' }, { update: { status: 'paid' } });

yield * registry.transact([aOp, bOp]);
```

## API

| Builder    | Returns                                      | Notes                                                         |
| ---------- | -------------------------------------------- | ------------------------------------------------------------- |
| `insertOp` | `Effect<TransactItem<TName>, DynamodbError>` | Same condition (collision check + user cond) as `insert`.     |
| `updateOp` | `Effect<TransactItem<TName>, DynamodbError>` | **Pre-fetches the row** so the broadcast payload is complete. |

The returned `TransactItem` carries `entityName` and a `broadcast` field
that the registry uses to fan changes out after the transaction
succeeds.

## Edge cases

- **`updateOp` pre-fetches the existing row.** It calls `get()`
  first to compose a complete `value` for the broadcast payload. If
  the row is missing, the op fails with `noItemToUpdate` before the
  transaction is even issued.
- **`insertOp` does not pre-fetch.** No round-trip happens — the op
  simply derives the new row, stamps meta, and packages the
  conditional put. If a collision is in the transaction, DynamoDB
  rejects the whole batch.
- **Broadcast is the registry's job, not the op's.** Both ops set
  `broadcast: { value, meta }`, but the actual `ConnectionService`
  emit only fires inside
  [`registry.transact`](../../registry/transact/index.doc.md) on
  success.
- **Update inside a transaction supports both update flavours.** The
  same `Partial<T>` / expression-builder choice is available as in
  `update`, with the same derivation-dependency restriction for the
  builder path.
- **Failures abort the whole transaction.** DynamoDB
  `TransactWriteItems` is all-or-nothing; any per-op condition
  failure rolls back the rest.

## Tests
