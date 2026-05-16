---
title: SqliteCommand
order: 5
---

# SqliteCommand

A JSON-shaped CRUD facade on top of an `EntityRegistry`. The processor
takes a `CommandPayload` (`insert | update | delete | query |
descriptor`), routes it to the right entity, runs the operation, and
returns a `CommandResponse` that includes timing.

`SqliteCommand` exists for clients that don't carry the entity types —
RPC servers, admin tools, sync workers, the trace viewer. The shape of
its input and output is shared with `@std-toolkit/db-dynamodb`'s
`DynamoCommand`, so the same wire protocol works against either backend.

## Why a JSON facade?

The entity API is fully typed; that's a wonderful guarantee for the
process that built the entity, and not at all useful for a remote
caller. The command processor erases the entity type into a tagged
union the wire understands, runs the typed call internally, and tacks
on a `timing` envelope (`startedAt`, `completedAt`, `durationMs`)
that's identical for every operation. RPC handlers / sync code consume
that timing.

```ts
const result =
  yield *
  command.process({
    operation: 'insert',
    entity: 'User',
    data: { userId: '1', email: 'a@b.com', name: 'A' },
  });
// result: { operation: 'insert', entity: 'User', data, timing }
```

## RPC integration

`SqliteCommand.RPC_PREFIX = '__std-toolkit__command'` and
`command.toRpcHandler('-myapp')` yields a single-key object
`{ '__std-toolkit__command-myapp': handler }` suitable for spreading
into an `@effect/rpc` group. The prefix is fixed so trace / admin
tooling can recognise std-toolkit commands without per-app config.

## Modules

| Module                                  | Role                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------- |
| [insert](./insert/index.doc.md)         | `{ operation: 'insert', entity, data }` → entity result + timing.         |
| [update](./update/index.doc.md)         | `{ operation: 'update', entity, key, data }` → entity result + timing.    |
| [delete](./delete/index.doc.md)         | `{ operation: 'delete', entity, key }` → soft-deleted entity + timing.    |
| [query](./query/index.doc.md)           | `{ operation: 'query', entity, index, pk, sk, limit? }` → items + timing. |
| [descriptor](./descriptor/index.doc.md) | `{ operation: 'descriptor' }` → `RegistrySchema.descriptors` + timing.    |

## Correctness story

Every command shape is documented operation-by-operation with the same
contract: how the payload is parsed, which entity method runs, how
errors are mapped to `CommandError`, and what the response envelope
looks like. The tests assert payload / response shape, not the live
SQLite round-trip (which is covered in `src/services/__tests__/`).
