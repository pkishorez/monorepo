# TanStack integration

The storage packages (`cache`, `db-sqlite`, `db-dynamodb`) answer one question:
_where do the versioned records live?_ This package answers a different one:
_how does a TanStack DB collection get wired up to speak the same versioned
language?_ It is the **client-side counterpart** to the backends — it does not
persist anything itself, it produces the **configuration objects** that tell
TanStack DB how to key, order, sync, and mutate std-toolkit entities.

## The mental model

You never build a TanStack collection by hand. You hand this package a schema
(plus a few effects describing where data comes from) and it hands you back a
ready-to-use **collection options object** — `getKey`, `compare`, `sync`,
`onInsert`, `onUpdate`, and a bag of `utils`. Four ideas hold the package
together:

1. **Options, not collections.** Every entry point is a pure factory that
   returns a config object. `stdCollectionOptions(...)` does not start syncing or
   touch the network — it describes _how_ a collection would. You pass the result
   to TanStack DB's `createCollection`. Because the factory is pure, the config
   is fully inspectable in a test without a running app.

2. **The envelope drives the wiring.** std-toolkit records are `EntityType<T>`
   envelopes — your value plus `meta` (`_e` type, `_v` version, `_u` update key,
   `_d` soft-delete). The package reads that envelope to do its job: `getKey`
   pulls the schema's id field, `compare` orders by `_u`, and broadcast routing
   matches on `_e`. The envelope is the contract between the backend and the
   collection.

3. **Three shapes, mirroring the backend.** A **collection** is many records of
   one kind (`stdCollectionOptions`). A **partitioned collection** is the same
   kind sliced per tenant/workspace, loaded on demand (`stdPartitionedCollectionOptions`).
   A **single item** is exactly one record, no id (`stdSingleItemOptions`). These
   are the client-side echo of cache's keyed collection / single item.

4. **A registry fans broadcasts out.** When the server pushes a batch of
   envelopes, `collectionRegistry` matches each one by its `_e` type to the
   collection that owns it and upserts — one inbound message, many collections
   updated, no manual routing.

## How the pieces fit

```
schema + effects ──▶ stdCollectionOptions(...)            ──▶ collection options
                 ──▶ stdPartitionedCollectionOptions(...)  ──▶ collection options
                 ──▶ stdSingleItemOptions(...)             ──▶ collection options (singleResult)

every options object: { getKey, compare?, sync, onInsert?, onUpdate, utils }
every record:         EntityType<T> = { value: T, meta: { _e, _v, _u, _d } }
collectionRegistry:   broadcast message ──match on _e──▶ owning collection.upsert
```

## How to read this tutorial

Start with **what this package produces** — the options-object mental model.
Then meet the three factories in order of how common they are: the everyday
**collection**, the **partitioned collection** for per-tenant slices, and the
**single item** for settings-like data. Finish with the **registry** that wires
broadcasts to collections. Each feature teaches one idea against a runnable,
no-app-required example.
