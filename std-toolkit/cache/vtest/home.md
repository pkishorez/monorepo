# Cache

A typed, Effect-based **local store** for the versioned records the rest of the
toolkit speaks in. When an app needs to keep data on the device — to render
instantly on reload, to work offline, to avoid re-fetching — it reaches for
cache. The package's job is to make that storage _uniform_: the same small API
whether the data lives in plain memory or in the browser's IndexedDB.

## The mental model

Think of cache as a set of small, named drawers you read and write through
Effects. Five ideas hold the whole package together:

1. **You store envelopes, not raw values.** Every record is an `EntityType<T>`
   — your value wrapped with `meta` (`_e` type, `_v` schema version, `_u` a
   monotonic update key, `_d` a soft-delete flag). The cache never invents this
   envelope; you hand it one and it hands the same shape back. The envelope is
   what makes versioning, ordering, and de-duplication possible.

2. **Two shapes of drawer.** A `CacheEntity<T>` is a _keyed collection_ — many
   records of one kind, addressed by id (think "all the users"). A
   `CacheSingleItem<T>` is a _single slot_ — exactly one record, no id (think
   "the current session"). Most data is a collection; settings-like data is a
   single item.

3. **A store is a factory.** You never construct a drawer directly. A
   `CacheStore` mints them: `store.entity({ name, idField })` and
   `store.singleItem({ name })`. The same `CacheStore` interface is implemented
   by every backend, so swapping memory for IndexedDB changes one line and
   nothing else.

4. **Recency is first-class.** Because each envelope carries `_u`, a collection
   can answer "what's the newest record?" and "what's the oldest?" without you
   tracking timestamps yourself — `getLatest()` / `getOldest()`.

5. **Everything is an Effect that can fail with `CacheError`.** No throwing, no
   silent `null`. Reads return `Option`, every operation returns an
   `Effect<…, CacheError>`, and namespacing within a backend is done with
   _partition keys_ serialized by `serializePartition`.

## How the pieces fit

```
CacheStore  ──entity()──▶  CacheEntity<T>     (many records, keyed by id)
            ──singleItem()▶ CacheSingleItem<T> (one record, no id)

every record:  EntityType<T> = { value: T, meta: { _e, _v, _u, _d } }
every result:  Effect<…, CacheError>, reads wrapped in Option
```

## How to read this tutorial

Follow the features top-to-bottom. We start with the **envelope** (what you
actually store), then the two drawer shapes — **keyed collection** and **single
item** — then the **recency** queries that the envelope unlocks, then the
**store factory** that ties the backends together, and finally **partition
keys** for namespacing. Each feature teaches one idea with a runnable example.
