---
title: command.descriptor
order: 5
---

# command.descriptor

Returns the unified registry descriptor — the same one the trace
viewer consumes — over the wire. Pure introspection; no DynamoDB
round-trip.

## Payload

```ts
{
  operation: 'descriptor';
}
```

## Response

```ts
{
  operation: 'descriptor',
  timing: { startedAt, completedAt, durationMs },
  descriptors: StdDescriptor[],
}
```

## Edge cases

- **No I/O.** The descriptor is computed in-memory from the registered
  entities; the operation always completes in microseconds.
- **Single entities are excluded.** `registry.getSchema()` only
  returns regular-entity descriptors — single entities have no index
  pattern visualization.
- **Schema versions are the _latest_.** Each descriptor reports
  `eschema.latestVersion`; older versions are not enumerated.
- **Index patterns are templated.** `pk` / `sk` are shown as
  `{Entity}#{field}#{...}` strings — the human-readable derivation,
  not example values.

## Tests
