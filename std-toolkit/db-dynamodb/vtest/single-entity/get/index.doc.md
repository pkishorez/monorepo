---
title: singleEntity.get
order: 2
---

# singleEntity.get

A total read. Unlike `DynamoEntity.get`, the result is never `null` —
when the underlying row is missing the library returns the configured
**default value** with synthetic meta.

## Usage

```ts
const config = yield * AppConfig.get();
config.value; // never null
```

## API

| Argument    | Type                                                | Meaning                                    |
| ----------- | --------------------------------------------------- | ------------------------------------------ |
| `options`   | `{ ConsistentRead?: boolean }`                      | Pass-through to DynamoDB `GetItem`.        |
| **returns** | `Effect.Effect<SingleEntityType<T>, DynamodbError>` | Always succeeds (or fails) — never `null`. |

## Edge cases

- **Default value is mandatory at build time.** `.default(...)` is the
  terminal builder step; it is not optional. The default's shape is
  `Omit<T, '_v'>` — you cannot pin the default to an older `_v`.
- **Missing row ⇒ default value with `_u: ''`.** The synthetic meta
  uses an empty `_u` string so callers can distinguish "never
  written" from "written at time T".
- **No tombstone semantics.** Single entities have no `_d`. To clear a
  single entity, write a `put` with the default value (or whatever the
  reset shape should be).
- **`ConsistentRead` is opt-in.** Defaults to false, like the regular
  entity.

## Tests
