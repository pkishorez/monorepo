---
title: memory
order: 3
---

# memory

`MemoryCache` is the in-process backend for `CacheStore`. It stores
`EntityType<T>` values in a `Map<id, item>` and maintains a parallel
`SortedMap<_u, id>` index so `getLatest()` / `getOldest()` are O(log n)
instead of O(n). `MemoryCacheSingleItem` is the trivial single-slot
analogue.

The backend has no dependencies beyond `effect`. It is the right choice
for tests, server-side ephemeral caching, or any context where data
should not survive a process restart.

## Usage

```ts
import { Effect } from 'effect';
import { MemoryCache } from '@std-toolkit/cache/memory';

const program = Effect.gen(function* () {
  const cache = new MemoryCache();
  const users = yield* cache.entity<User>({ name: 'User', idField: 'id' });

  yield* users.put({
    value: { id: 'u1', name: 'Alice' },
    meta: { _e: 'User', _v: 'v1', _u: 'uid-001', _d: false },
  });
});
```

## API

| Export                     | Kind  | Notes                                                        |
| -------------------------- | ----- | ------------------------------------------------------------ |
| `MemoryCache`              | class | Implements `CacheStore`. Construct with `new MemoryCache()`. |
| `MemoryCacheEntity<T>`     | class | Created via `MemoryCacheEntity.make({ name, idField })`.     |
| `MemoryCacheSingleItem<T>` | class | Created via `MemoryCacheSingleItem.make({ name })`.          |

`MemoryCache#entity` and `#singleItem` return
`Effect.Effect<…, never>` — construction cannot fail for this backend.
All instance methods (`put`, `get`, `getAll`, `getLatest`, `getOldest`,
`delete`, `deleteAll`) return `Effect.Effect<…, CacheError>` because
their bodies are wrapped in `Effect.try` for symmetry with the IDB
backend.

## Examples

### Round-trip a single entity

```ts
const users =
  yield *
  MemoryCacheEntity.make<User>({
    name: 'User',
    idField: 'id',
  });
yield *
  users.put({
    value: { id: 'u1', name: 'Alice' },
    meta: { _e: 'User', _v: 'v1', _u: 'uid-001', _d: false },
  });
const got = yield * users.get('u1'); // Option.some({ value, meta })
```

### Missing key returns `Option.none()`

```ts
const got = yield * users.get('missing'); // Option.none()
```

### `put` of an existing id overwrites

```ts
yield* users.put({ value: { id: 'u1', name: 'Alice' }, meta: { ... } });
yield* users.put({ value: { id: 'u1', name: 'Alice II' }, meta: { ... } });
(yield* users.getAll()).length; // 1
```

### `getLatest()` / `getOldest()` track by `_u`

```ts
yield* users.put({ value: { id: 'a' }, meta: { ..., _u: 'uid-002' } });
yield* users.put({ value: { id: 'b' }, meta: { ..., _u: 'uid-001' } });
yield* users.put({ value: { id: 'c' }, meta: { ..., _u: 'uid-003' } });

(yield* users.getLatest()).value.value.id;  // 'c' (_u uid-003)
(yield* users.getOldest()).value.value.id;  // 'b' (_u uid-001)
```

### Single-item slot

```ts
const slot = yield * MemoryCacheSingleItem.make<Settings>({ name: 'Settings' });
yield *
  slot.put({
    value: { theme: 'dark' },
    meta: { _e: 'Settings', _v: 'v1', _u: 'uid-1' },
  });
const got = yield * slot.get(); // Option.some({ value, meta })
yield * slot.delete();
const gone = yield * slot.get(); // Option.none()
```

## Edge cases

- **`MemoryCache#entity` / `#singleItem` cannot fail.** They are typed
  as `Effect.Effect<…, never>` because the underlying constructor only
  allocates JavaScript objects.
- **The id is derived from `value[idField]` via `String(...)`.** Numeric
  ids are coerced to strings; the cache only ever keys by string.
- **`put` on an existing id replaces the row and rewrites the `_u`
  index.** The old `_u` entry is removed before the new one is inserted,
  so `getLatest()` / `getOldest()` reflect the new marker.
- **`getLatest()` / `getOldest()` consult `_u` only.** No clock, no
  insertion order, no schema version. Two items with identical `_u`
  collapse to one entry in the sorted index — avoid generating
  duplicates.
- **`delete` of an unknown id is a no-op.** No error is raised, and the
  `_u` index is left untouched.
- **`deleteAll` resets both the store and the `_u` index.** A subsequent
  `getLatest()` / `getOldest()` returns `Option.none()`.
- **Empty store → `Option.none()` for `getLatest` / `getOldest`.**
  Callers do not need to special-case the empty case before checking
  the option.
- **`MemoryCacheSingleItem` holds at most one value.** A second `put`
  overwrites the slot; `delete` empties it. `get` on an empty slot
  returns `Option.none()`.

## Tests

The suites in `index.test.ts` lock down:

- `MemoryCache#entity` returns a working `MemoryCacheEntity`.
- `put` then `get` round-trips both `value` and `meta`.
- `get` on a missing id returns `Option.none()`.
- `getAll` returns every stored row exactly once.
- `put` on an existing id replaces the row (length stays at 1).
- `getLatest` / `getOldest` track by `_u`, including after updates.
- `delete` of an unknown id is a no-op.
- `deleteAll` empties the store and the `_u` index.
- `MemoryCacheSingleItem` round-trips a single value and `delete`
  empties it.
