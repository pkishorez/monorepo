---
title: idb
order: 4
---

# idb

`IDBCache` is the browser-side backend for `CacheStore`, built on
IndexedDB via the [`idb`](https://github.com/jakearchibald/idb) wrapper.
A single named database holds a shared object store, partitioned by
entity name. The store keeps an `updatedKey` index so `getLatest()` /
`getOldest()` can answer in O(log n) via an IndexedDB cursor instead of
loading every row.

`IDBCacheSingleItem` is the single-slot analogue; it reserves a fixed
`__singleton__` id within the same store.

Tests run against [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB),
which the package already ships as a devDependency.

## Usage

```ts
import { Effect } from 'effect';
import { IDBCache } from '@std-toolkit/cache/idb';

const program = Effect.gen(function* () {
  const cache = new IDBCache('app-cache', 1);
  const users = yield* cache.entity<User>({ name: 'User', idField: 'id' });

  yield* users.put({
    value: { id: 'u1', name: 'Alice' },
    meta: { _e: 'User', _v: 'v1', _u: 'uid-001', _d: false },
  });
});
```

## API

| Export                  | Kind  | Notes                                                                                  |
| ----------------------- | ----- | -------------------------------------------------------------------------------------- |
| `IDBCache`              | class | `new IDBCache(dbName, version)`. Opens lazily on the first `entity`/`singleItem` call. |
| `IDBCacheEntity<T>`     | class | Created via `IDBCacheEntity.make({ dbName?, name, idField })`.                         |
| `IDBCacheSingleItem<T>` | class | Created via `IDBCacheSingleItem.make({ dbName?, name })`.                              |

`IDBCacheEntity.destroyAllDatabases()` is a static escape hatch that
clears every IDB database known to the connection pool — intended for
tests.

## Examples

### Round-trip a single entity through IDB

```ts
const cache = new IDBCache('app-cache', 1);
const users = yield * cache.entity<User>({ name: 'User', idField: 'id' });

yield *
  users.put({
    value: { id: 'u1', name: 'Alice' },
    meta: { _e: 'User', _v: 'v1', _u: 'uid-001', _d: false },
  });

const got = yield * users.get('u1'); // Option.some(...)
```

### `getLatest()` / `getOldest()` via the `_u` index

```ts
yield* users.put({ value: { id: 'a' }, meta: { ..., _u: 'uid-002' } });
yield* users.put({ value: { id: 'b' }, meta: { ..., _u: 'uid-001' } });
yield* users.put({ value: { id: 'c' }, meta: { ..., _u: 'uid-003' } });

(yield* users.getLatest()).value.value.id;  // 'c'
(yield* users.getOldest()).value.value.id;  // 'b'
```

### Two entities under different names share the same DB

```ts
const users = yield * cache.entity<User>({ name: 'User', idField: 'id' });
const posts = yield * cache.entity<Post>({ name: 'Post', idField: 'id' });

yield * users.put(u1);
yield * posts.put(p1);

(yield * users.getAll()).length; // 1 — bounded to the User name range
(yield * posts.getAll()).length; // 1 — bounded to the Post name range
```

### Single-item slot

```ts
const slot =
  yield *
  IDBCacheSingleItem.make<Settings>({
    dbName: 'app-cache',
    name: 'Settings',
  });
yield *
  slot.put({
    value: { theme: 'dark' },
    meta: { _e: 'Settings', _v: 'v1', _u: 'uid-1' },
  });
```

## Edge cases

- **The DB opens lazily.** `IDBCache#entity` / `#singleItem` call
  `ConnectionPool.acquire` on first use; construction of `IDBCache`
  itself does no I/O.
- **Open failures surface as `CacheError` with `error._tag ===
'OpenFailed'`.** Anything thrown by the underlying `idb` open call is
  wrapped.
- **Entities under different `name`s within the same DB are isolated.**
  Each row is keyed by `[name, id]` and queries use a name-bounded
  `IDBKeyRange`, so `getAll` for `name: 'User'` never returns `Post`
  rows.
- **`getLatest` / `getOldest` walk the `UPDATED_INDEX` cursor.** They
  open a `prev` (resp. `next`) cursor bounded to the name range, so the
  first hit is the answer — no full scan.
- **A missing `_u` index entry yields `Option.none()`.** An empty
  cursor on the bounded range returns `None`, matching the in-memory
  backend.
- **`IDBCacheSingleItem` reserves the id `__singleton__`.** A regular
  entity named the same that puts an item with id `__singleton__` would
  collide — keep entity and single-item names disjoint.
- **`IDBCacheSingleItem#put` always writes `_d: false` into the stored
  meta.** The single-item interface has no soft-delete concept; the
  flag is normalised away on write.
- **`destroyAllDatabases` is a global teardown.** It drops every
  database held by the connection pool — only use it between tests, not
  in production code.

## Tests

The suites in `index.test.ts` lock down (against `fake-indexeddb`):

- `IDBCache#entity` returns a working `IDBCacheEntity`.
- `put` then `get` round-trips both `value` and `meta`.
- `get` on a missing id returns `Option.none()`.
- `getAll` returns every stored row exactly once for a given name.
- Two entities under different `name`s in the same DB do not see each
  other's rows.
- `getLatest` / `getOldest` consult the `_u` index across the name
  range.
- `delete` of a known id removes the row; `deleteAll` clears the
  name-bounded range.
- `IDBCacheSingleItem` round-trips a single value; `delete` empties
  the slot.
