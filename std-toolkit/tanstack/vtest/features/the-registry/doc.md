# The registry

The final piece wires the server to the client. When your backend pushes a
batch of envelopes over a broadcast channel, something has to decide _which
collection each record belongs to_ and update it. That something is
`collectionRegistry`.

## Match on the entity type, fan out the upsert

You build a registry by adding the collections and single items you care about,
then `build()` it. The result has a `process(message)` that, for each envelope
in a broadcast message, finds the collection whose schema name matches the
envelope's `_e` type and upserts the record there. One inbound message, many
collections updated, zero manual routing.

```ts
const registry = collectionRegistry
  .create()
  .add(taskCollection) // a stdCollectionOptions result
  .addSingle(settingsItem) // a stdSingleItemOptions result
  .build();

registry.process(broadcastMessage); // routes each envelope by its _e type
```

`process` is deliberately forgiving: it validates the message against the shared
broadcast schema and silently ignores anything that does not match — `null`,
junk objects, wrong tags. A malformed push never throws into your UI. The
registry also exposes `fetchAll`, an Effect that refreshes every registered
collection and single item at once.

::test-group{id=routing}
