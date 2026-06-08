# What sync solves

A TanStack DB collection is an in-memory mirror of server data. Keeping that
mirror fresh is the whole problem. The naive answer — refetch everything on
every change — does not scale: it burns bandwidth and throws away work the
client already did.

## Envelopes carry their own truth

std-toolkit never ships bare values across the wire. Every record is an
`EntityType<T>` **envelope**: the value plus a `meta` block.

```ts
type EntityType<T> = {
  value: T;
  meta: {
    _e: string; // entity type, e.g. "Task"
    _v: string; // schema version, e.g. "v1"
    _u: string; // update key — monotonic, orders writes
    _d: boolean; // soft-delete tombstone
  };
};
```

The envelope is what makes sync robust. The collection does not care which
message arrives first; it cares about `_u`. A newer `_u` wins, an older `_u` is
ignored, and `_d: true` removes the row. This means the same record can be
delivered twice, out of order, or as a late tombstone — the collection always
converges to the right state.

That convergence rule is the foundation everything else builds on: total sync,
cursor sync, and the registry all write through it. The test below pins the
rule down directly, with no collection in sight.

::test-group{id=envelope-ordering}
