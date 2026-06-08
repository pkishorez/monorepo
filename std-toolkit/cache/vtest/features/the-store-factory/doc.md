# The store factory

So far every example started with `new MemoryCache()`. That class is one
implementation of a single interface — `CacheStore` — and that interface is the
seam that lets your code be backend-agnostic.

## One interface, many backends

A `CacheStore` does exactly two things: mint a keyed collection, or mint a
single item.

```ts
interface CacheStore {
  entity<T>(opts: { name: string; idField: string }): Effect<CacheEntity<T>, …>;
  singleItem<T>(opts: { name: string }): Effect<CacheSingleItem<T>, …>;
}
```

The package ships two implementations behind this interface:

- `MemoryCache` (from `@std-toolkit/cache/memory`) — ephemeral, in-process;
  perfect for tests and transient state.
- `IDBCache` (from `@std-toolkit/cache/idb`) — durable, backed by the browser's
  IndexedDB.

Because they share the interface, the drawer you get back behaves the same way
regardless of which store minted it. Your data code is written once against
`CacheEntity` / `CacheSingleItem` and the choice of backend becomes a single
line at the edge.

## Backend parity

The proof is that the _same_ operations produce the _same_ observable result on
both backends. Below, an identical put/get/getLatest sequence runs against
memory and against IndexedDB and yields the same answers.

::test-group{id=backend-parity}

## The factory also mints single items

The second factory method, `singleItem`, works the same way across backends —
you ask the store, you get a slot.

::test-group{id=single-item-factory}
