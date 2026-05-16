---
title: entity.subscribe
order: 8
---

# entity.subscribe

A two-phase live-tail. The catch-up phase walks the index from a
caller-provided cursor and **emits each batch through
`ConnectionService.emit(items)`**. Once the index drains, the entity
calls `ConnectionService.subscribe(entityName)` so future writes are
streamed by the regular broadcast path.

Only timeline-SK indexes (SK is exactly `['_u']`) are subscribable —
that's the only index where "since cursor" has a well-defined meaning.

## Usage

```ts
yield *
  PostEntity.subscribe({
    key: 'byAuthor',
    pk: { authorId: 'u1' },
    cursor: lastSeenU, // null to start from scratch
    limit: 200, // optional batch size
  });
```

## API

| Field       | Type                                                        | Meaning                                              |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| `key`       | `'primary' \| SubscribableSecondaryKeys<…>`                 | Primary or a timeline-SK secondary index.            |
| `pk`        | `IndexKeyFields<T, …>`                                      | PK fields for the selected index.                    |
| `cursor`    | `string \| null`                                            | `_u` to resume from, or `null` to start at the head. |
| `limit`     | `number?`                                                   | Optional per-iteration batch size.                   |
| **returns** | `Effect.Effect<{ success: true }, SqliteDBError, SqliteDB>` | Resolves after the live-tail hand-off.               |

## Examples

### First-time subscribe (cursor = null)

```ts
yield *
  PostEntity.subscribe({
    key: 'byAuthor',
    pk: { authorId: 'u1' },
    cursor: null,
  });
```

### Resume after a reconnect

```ts
yield *
  PostEntity.subscribe({
    key: 'byAuthor',
    pk: { authorId: 'u1' },
    cursor: lastSeenU,
  });
```

## Edge cases

- **Only timeline-SK indexes are subscribable.** A non-`_u` SK has
  no meaningful "since cursor"; the type system refuses the call.
- **`cursor: null` starts from the beginning of the index.** Pass a
  stored `_u` string to resume.
- **Drained batches are emitted through `service.emit`, not
  broadcast.** Broadcast is reserved for live writes; the catch-up
  phase uses `emit(batch)` so the subscriber can distinguish initial
  sync from live events.
- **`subscribe` loops until a page returns 0 items.** After the
  catch-up loop drains the index, the entity calls
  `service.subscribe(entityName)` so live writes start flowing.
- **Each loop iteration advances the cursor by the last item's
  `_u`.** The library passes `{ '>': currentCursor }` and updates
  `currentCursor` to the last row's `meta._u`.
- **Returns `{ success: true }` once handed off to live-tail.** The
  interesting outcome is the side-effect on `ConnectionService`.

## Tests

Tests live alongside this doc.
