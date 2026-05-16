---
title: DynamoCommand
order: 4
---

# DynamoCommand

A JSON-payload facade over an `EntityRegistry`. Each call takes a
typed payload (`InsertPayload`, `UpdatePayload`, `DeletePayload`,
`QueryPayload`, `DescriptorPayload`), routes to the right
`registry.entity(name)`, and returns a structured response that
includes timing information. Designed to be plugged behind RPC
(`toRpcHandler`) so the wire format is data, not function calls.

## Modules

| Module                                  | Role                                                                  |
| --------------------------------------- | --------------------------------------------------------------------- |
| [insert](./insert/index.doc.md)         | `InsertPayload` → `entity.insert`; timing-wrapped response.           |
| [update](./update/index.doc.md)         | `UpdatePayload` → `entity.update`; partial updates only.              |
| [delete](./delete/index.doc.md)         | `DeletePayload` → `entity.delete` (soft delete).                      |
| [query](./query/index.doc.md)           | `QueryPayload` → `entity.query`; index name in the payload.           |
| [descriptor](./descriptor/index.doc.md) | Returns `registry.getSchema().descriptors` for introspection tooling. |

## Usage

```ts
const cmd = DynamoCommand.make(registry);
const handler = cmd.toRpcHandler();

const { data } =
  yield *
  cmd.process({
    operation: 'insert',
    entity: 'User',
    data: { id: '1', email: 'a@b.com', name: 'A' },
  });
data.value; // the inserted user
data.meta; // its meta
```

## Edge cases

- **Errors are mapped to `CommandError`.** Each operation wraps the
  underlying `DynamodbError` with `{ operation, entity, message,
cause }`. The original error is preserved in `cause` for debugging.
- **Unknown entity throws synchronously.** `getEntity` raises `Error
"Entity X not found in registry"` before the operation is built —
  this is **not** wrapped in `CommandError`. It is a developer bug,
  not a runtime data issue.
- **Single entities are not routed.** `DynamoCommand` only knows
  about regular entities; calling it with a single-entity name
  raises the not-found error.
- **Insert uses no condition.** The payload carries no `condition`
  field — collisions surface as the standard
  `itemAlreadyExists`/`CommandError`.
- **Update only supports partial values.** The payload's `data` field
  is sent through as the partial; the expression-builder variant is
  not exposed over the wire.
- **Delete is always soft.** No `forceDelete` over the wire — hard
  delete is intentionally not exposed.
