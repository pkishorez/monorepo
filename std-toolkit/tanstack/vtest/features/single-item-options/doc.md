# The single item

Not everything is a list. Some client state is inherently singular: the current
user's settings, the active feature flags, the workspace theme. Forcing those
into a keyed collection means inventing a fake id. `stdSingleItemOptions` gives
TanStack DB a collection that holds exactly one record — the echo of cache's
single item.

## One record, a constant key

A single item is built from a `SingleEntityESchema` (no id field, because there
is no key) and a `get` effect that fetches the one record. The resulting config
carries `singleResult: true`, and its `getKey` ignores its argument and returns
the schema name as a constant — there is only ever one row, always at the same
key.

```ts
const config = stdSingleItemOptions({
  schema: SettingsSchema, // a SingleEntityESchema
  get: () => fetchSettings(), // Effect<SingleEntityType<Settings>>
  onUpdate: (payload) => saveSettings(payload.updates),
});

config.singleResult; // true
config.getKey({}); // "AppSettings" — constant, ignores the argument
```

The utils differ from a collection's, too. A single item has `refetch` (re-run
`get`) but no `fetch`/`fetchAll` paging — there is nothing to page through. And
there is no `compare` or `onInsert`: a single item is replaced, never inserted
into a list or sorted against siblings.

::test-group{id=single-shape}
