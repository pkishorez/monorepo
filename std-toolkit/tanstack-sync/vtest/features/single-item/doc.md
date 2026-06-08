# Single item

Not all server state is a list. Settings, the current user, a feature-flag
blob — these are exactly **one** record with no id. `singleItem` produces a
collection for that case: a `singleResult` config that holds a single row at a
constant key.

```ts
const settings = createStdSync().singleItem({
  schema: SettingsSchema, // a SingleEntityESchema, no id field
  get: () => fetchSettings(), // Effect<SingleEntityType<Settings>>
  onUpdate: ({ updates }) => saveSettings(updates),
});
```

## get loads the one row

There is no cursor and no paging here — there is only one record. On mount the
collection runs `get`, writes the returned envelope, and is done. Because there
is exactly one row, `getKey` ignores its argument and always returns the schema
name: every write lands on the same key, replacing the previous value.

`utils.refresh()` re-runs `get` on demand (for a manual reload), and `onUpdate`
writes an edit back to the server and reflects the result locally. The envelope
here is a `SingleEntityType` — the same `meta` block minus `_d`, since a single
item is never soft-deleted, only replaced.

::test-group{id=single-row}
