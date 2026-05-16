---
title: entity.insert
order: 2
---

# entity.insert

Writes a new row. The library stamps `_e`/`_v`/`_u`/`_d=0`, derives
the primary `(pk, sk)` and every registered secondary index column,
JSON-encodes the payload into `_data`, and calls `table.putItem`. On
success the inserted entity is broadcast through `ConnectionService`.

> Unlike `db-dynamodb`'s `insert`, this is currently a **`putItem`**
> (upsert) on the underlying table, not a conditional put. If you need
> "fail if already exists", do `get(...)` first inside a
> `registry.transaction(...)`.

## Usage

```ts
const inserted =
  yield * UserEntity.insert({ userId: '1', email: 'a@b.com', name: 'A' });
inserted.value; // { userId, email, name }
inserted.meta; // { _e: 'User', _v, _u, _d: false }
```

## API

| Argument    | Type                                                    | Meaning                                  |
| ----------- | ------------------------------------------------------- | ---------------------------------------- |
| `value`     | `Omit<T, '_v'>`                                         | Entity payload — caller never sets `_v`. |
| **returns** | `Effect.Effect<EntityType<T>, SqliteDBError, SqliteDB>` | The inserted entity + fresh meta.        |

## Examples

### Insert inside a transaction (so a sibling write can roll us back)

```ts
yield *
  registry.transaction(
    Effect.gen(function* () {
      yield* UserEntity.insert({ userId: '1', email: 'a@b', name: 'A' });
      yield* AuditEntity.insert({
        auditId: 'a1',
        actor: 'system',
        action: 'created-user',
      });
    }),
  );
```

## Edge cases

- **`_v` is taken from the schema, never the caller.** The input
  type is `Omit<T, '_v'>`; the library stamps
  `_v = schema.latestVersion` on every write.
- **`_u` is an ISO timestamp generated at write time.** Every
  successful insert refreshes `_u`; `queryStream` / `subscribe`
  consumers use it as a monotonic cursor.
- **`_data` is the JSON-encoded payload, `_e` is the entity name.**
  The single-table layout stores the full payload in one `TEXT`
  column; `_e` is set once on insert and never re-written.
- **Inserted row carries `_d: 0` (not deleted).** A fresh insert
  always lands with the tombstone flag cleared.
- **Broadcast fires only after the row lands.** On success, the
  entity emits to `ConnectionService` — or, inside a transaction, into
  the pending broadcast buffer that the registry flushes on commit.

## Tests

Tests live alongside this doc and assert the contract / meta shape,
not the live SQLite write.
