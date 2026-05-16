---
title: singleEntity.put
order: 1
---

# singleEntity.put

Unconditional upsert. Writes the supplied value, stamps `_v` at the
latest schema version, and refreshes `_u`. **There is no
collision-check** — `put` will overwrite the existing row by design,
because the row uniquely represents "the current value".

## Usage

```ts
yield * AppConfig.put({ theme: 'dark', tier: 'pro' });
```

## API

| Argument    | Type                             | Meaning                               |
| ----------- | -------------------------------- | ------------------------------------- |
| `value`     | `Omit<T, '_v'>`                  | The new value. `_v` is library-owned. |
| **returns** | `Effect<SingleEntityType<T>, _>` | The written value with fresh meta.    |

## Edge cases

- **No conditional check.** Unlike `DynamoEntity.insert`, `put` is
  unconditional. It is an upsert — overwriting is the intended
  semantics.
- **`_v` and `_u` are always stamped.** The caller cannot pin `_v` or
  set `_u` — the library writes both on every call.
- **No `_d`.** There is no soft-delete concept; `put` does not write a
  `_d` column.
- **No broadcast.** `put` does not emit through `ConnectionService`.
  If you need broadcast semantics on a single entity, use `update`
  inside a `registry.transact([...])` (the registry fans out
  `TransactItem.broadcast` after the ack).

## Tests
