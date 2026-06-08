# The registry

So far every collection pulls. But servers also **push**: a websocket delivers a
batch of envelopes and the client must route each to the collection that owns
it. Doing that by hand — a switch on entity type for every message — is exactly
the boilerplate this package exists to remove.

## process fans a broadcast out by \_e

`registry()` returns one method, `process(message)`. Hand it a broadcast and it
matches each envelope by its `_e` type against the collections **this same
`createStdSync()` instance** created, and upserts into the matching one. One
inbound message, many collections updated, no manual routing.

```ts
const std = createStdSync();
const tasks = std.totalSync({ schema: TaskSchema, query });
const registry = std.registry();

socket.onMessage((msg) => registry.process(msg));
```

## The same convergence rule applies

Broadcasts are not special: they flow through the very rule from the first
chapter. A pushed envelope with a newer `_u` wins; a **stale** tombstone — a
`_d: true` envelope older than the live row — is ignored, so a late delete can
never wipe out a record the server has since revived. The registry inherits
correctness from the envelope, not from delivery order.

::test-group{id=routing}
