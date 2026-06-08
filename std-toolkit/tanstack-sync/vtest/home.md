# TanStack sync

A TanStack DB collection is a live, in-memory mirror of server data. The hard
part is never the rendering — it is keeping that mirror **fresh** without
re-downloading the world on every change. This package answers one question:
_how does a std-toolkit collection stay in sync with a server that speaks
versioned envelopes?_

`createStdSync` hands you ready-to-use **collection configs** — `getKey`,
`compare`, `sync`, `onInsert`/`onUpdate`/`onDelete`, and a bag of `utils`. You
pass them to TanStack DB's `createCollection`. The package never renders, never
owns the network; it owns the **wiring** between a versioned backend and a
TanStack collection.

## The mental model

std-toolkit records travel as `EntityType<T>` **envelopes**: your value plus
`meta` — `_e` (entity type), `_v` (version), `_u` (update key, monotonic), and
`_d` (soft-delete tombstone). Sync is the art of reading those envelopes to
decide what to write into the collection, and _when_. Four ideas hold the
package together:

1. **One factory, four sync shapes.** `createStdSync()` returns a small object:
   `totalSync` (mirror an entire collection), `onDemand` (load slices per
   partition value, lazily), `singleItem` (exactly one record, no id), and
   `registry` (fan inbound broadcasts out to collections). One call, one shared
   tracker behind them, optional shared `options` defaults.

2. **Cursors, not full refetches.** A sync `query` receives a `getCursor`
   effect: the newest envelope the collection has already seen (ordered by `_u`).
   You send that cursor to the server and get back only what changed since — an
   append-log, not a snapshot. The collection grows incrementally.

3. **The envelope decides the write.** `getKey` pulls the schema's id field;
   `compare` orders by `_u`; a **stale** envelope (older `_u` than the row it
   targets) is ignored; a `_d: true` envelope deletes by key. The collection
   never trusts arrival order — only the envelope's `_u`.

4. **A registry fans broadcasts out.** When the server pushes a batch of
   envelopes, `registry().process(message)` matches each by its `_e` type to the
   collection that owns it and upserts — one inbound message, many collections
   updated, the same staleness rules applied.

## How the pieces fit

```
const std = createStdSync()

std.totalSync({ schema, query })   ──▶ collection config (full mirror, cursor-paged)
std.onDemand({ schema, queries })  ──▶ collection config (per-partition slices)
std.singleItem({ schema, get })    ──▶ collection config (one record, singleResult)
std.registry()                     ──▶ { process(message) }  fan-out by _e

every record:   EntityType<T> = { value: T, meta: { _e, _v, _u, _d } }
query cursor:   getCursor ──▶ newest seen envelope ──▶ "give me what changed since"
write rule:     newer _u wins; _d:true deletes; stale _u ignored
```

## How to read this tutorial

Start with **what sync solves** — the cursor / append-log mindset versus
re-downloading the world. Then meet **`createStdSync`**, the single factory.
Walk the sync shapes in order of how common they are: the everyday
**total sync**, then **cursor sync** (the incremental heart of the package),
then the **single item** for settings-like data. Finish with the **registry**
that wires server broadcasts to collections. Every feature teaches one idea
against a runnable, no-app-required example.
