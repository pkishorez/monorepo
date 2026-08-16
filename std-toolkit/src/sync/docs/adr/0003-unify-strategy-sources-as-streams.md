---
status: accepted
---

# Unify strategy sources as Streams

Sync Strategies currently expose different combinations of fetch and subscription callbacks, which makes finite drains, polling, and live delivery look like unrelated lifecycles. A source API will describe those delivery modes explicitly and normalize them to Effect Streams, while each directional Sync Strategy continues to own cursor interpretation, Sync State, concurrency, and writes, and the Sync engine continues to own the Collection or Partition lifecycle.

## Decision

Introduce contextual constructors for Backend delivery modes:

- `paginated` unfolds cursor-based requests into a finite Stream.
- `live` opens a Stream that can catch up and continue delivering changes.
- `poll` repeats cursor-based requests according to an explicit Schedule.
- `once` performs one single-item request and completes.
- Single-item `poll` performs one request immediately and repeats according to
  an explicit Schedule.
- `subscribe` opens a cursor-free single-item Stream that catches up and
  continues delivering replacements.

Partitioned source Streams emit non-empty Entity batches so applying a batch and
advancing Sync State remain one ordered checkpoint. The source interprets empty
backend pages rather than emitting them. A directional strategy supplies the
cursor advancement rule when it opens a source; the source does not guess whether
the newest or oldest Entity is the next cursor.

`live.open` returns a Stream directly. Effectful acquisition, failure,
dependencies, and finalization remain in the Stream rather than creating a
second Effect layer around it.

`poll` fetches immediately and then uses its Schedule between later requests. A
non-empty response advances the cursor, while an empty response retains it and
polling continues. Fetch failures escape to the existing strategy supervisor.

A source Stream may complete. Users will not add a fake never-ending Stream or `Effect.never`; completion means that source has no more work, not that the surrounding Sync lifecycle has ended. Strategies may compose finite backlog and live sources while preserving their strategy-owned Sync State.

Strategies retain their directional APIs and receive sources through named source
slots. Each slot is a callback whose argument contains exactly the constructors
valid for that role. There is no standalone public `syncSource` namespace or
second source-construction path.

The public strategy shapes are:

```ts
syncStrategy.oldToNew({
  source: ({ paginated }) => paginated({ fetch: api.fetchAfter }),
});

syncStrategy.newToOld({
  backfill: ({ paginated }) => paginated({ fetch: api.fetchBefore }),
  tail: ({ live }) => live({ open: api.subscribeAfter }),
});

syncStrategy.bidirectional({
  older: ({ paginated }) => paginated({ fetch: api.fetchBefore }),
  newer: ({ paginated }) => paginated({ fetch: api.fetchAfter }),
  tail: ({ live }) => live({ open: api.subscribeAfter }),
});
```

The accepted source modes are constrained by each role. `oldToNew.source`
accepts paginated, live, or poll delivery; `newToOld.backfill` accepts paginated
delivery and its `tail` accepts live delivery; `bidirectional.older` and
`bidirectional.newer` accept paginated delivery and its `tail` accepts live
delivery.

Cursor boundaries are exclusive. A null cursor selects the initial directional
edge; forward fetch and live delivery continue strictly after a non-null cursor,
while backward fetch continues strictly before it.

Backend callbacks may produce readonly Entity arrays, including empty arrays.
Partitioned sources normalize these to Streams of non-empty readonly batches.

Ordinary single-item sync receives a single-item source directly:

```ts
std.singleItemCollection({
  schema: SettingsSchema,
  source: ({ once }) => once({ fetch: () => api.getSettings() }),
});
```

Single-item collections accept exactly three source modes:

- `once({ fetch })` obtains one complete backend-confirmed value.
- `poll({ fetch, schedule })` obtains a complete value immediately and repeats
  according to the Schedule.
- `subscribe({ open })` opens a Stream of complete backend-confirmed values. It
  must eventually emit the current value before continuing with later
  replacements.

Single-item sources are cursor-free and emit one complete value at a time. They
do not emit patches, and partitioned `paginated`, `poll`, and `live` sources are
not accepted by single-item collections.

The `singleItemSyncStrategy.getOnce` wrapper is removed. A single-item collection
requires exactly one of `source` or a custom `SingleItemStrategy`; the latter
remains an advanced alternative preserving custom workers and persisted strategy
state.

Source values remain internal to their contextual builder callbacks. This
preserves normalization invariants and makes incompatible modes unavailable at
each strategy slot. `live` remains the general partitioned escape hatch because
it accepts an arbitrary Stream.

Source failures are not retried internally. They escape to the existing strategy
supervisor, which reports the failure, reopens the source after its retry delay,
and resumes from persisted Sync State.

This is a clean breaking migration. The old strategy callback configurations
will be removed rather than retained as deprecated overloads.

## Consequences

The migration covers the `oldToNew`, `newToOld`, and `bidirectional` partitioned
strategies plus single-item one-time, polling, and subscription delivery. Cadence
Repair remains outside this decision because its repair semantics differ, and
its existing API remains unchanged.
