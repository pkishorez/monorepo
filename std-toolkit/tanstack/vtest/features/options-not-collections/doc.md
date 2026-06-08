# Options, not collections

Before any specific factory, it helps to understand the one thing every entry
point in this package has in common: it returns a **plain configuration object**,
not a live collection. You take that object and pass it to TanStack DB's
`createCollection` yourself. The package's job ends at producing a correct
config.

## Why this matters

Because the factory is pure, calling it starts nothing — no network, no sync, no
app required. The result is just data you can read. That is what lets us teach
(and test) the integration without ever mounting a React tree: we call the
factory and inspect the fields it produced.

```ts
const config = stdCollectionOptions({
  syncMode: 'eager',
  schema: TestSchema, // an EntityESchema from @std-toolkit/eschema
  getMore: () => Effect.succeed([]),
  onInsert: (item) => Effect.succeed(/* an EntityType envelope */),
});

config.getKey; // (item) => string
config.compare; // (a, b) => number, orders by the _u update key
config.sync.sync; // the function TanStack calls to start syncing
config.utils; // schema(), upsert, fetch, fetchAll, isSyncing
```

Two fields are worth singling out because they come straight from the envelope
model. `getKey` extracts the schema's id field from an item, and `compare`
orders two items by their `_meta._u` update key — newest last. Everything else
in the toolkit can rely on those two behaviors being consistent across every
collection.

::test-group{id=options-shape}
