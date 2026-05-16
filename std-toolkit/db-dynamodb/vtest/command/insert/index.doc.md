---
title: command.insert
order: 1
---

# command.insert

Maps `InsertPayload` → `entity.insert(payload.data)`. Returns
`InsertResponse` with the inserted entity and timing.

## Payload

```ts
{
  operation: 'insert',
  entity: string,       // entity name registered in the registry
  data: object,         // Omit<T, '_v'>
}
```

## Response

```ts
{
  operation: 'insert',
  entity: string,
  data: EntityType<T>,
  timing: { startedAt, completedAt, durationMs },
}
```

## Edge cases

- **No `condition` field in the payload.** Wire-level inserts cannot
  pass a custom condition; they get only the built-in collision check.
- **`itemAlreadyExists` ⇒ `CommandError` with `operation: 'insert'`.**
  The original `DynamodbError` is in `cause`.
- **Timing wraps the underlying call only.** `startedAt` is set
  before `getEntity`, `completedAt` after the `insert` resolves.
- **Unknown entity ⇒ synchronous `Error`.** Not wrapped in
  `CommandError`; it surfaces as an Effect defect.

## Tests
