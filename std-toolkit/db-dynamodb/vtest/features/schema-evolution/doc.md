# Schema evolution

Stored data outlives the schema that wrote it. Add a field, rename one, change a
shape — and suddenly the rows already on disk are the "old" shape. This package
makes that a first-class, _total_ operation: an `ESchema` can `.evolve(...)` to a
new version, and the store knows how to bring old items forward.

## Declaring a new version

`.evolve(version, newFields, upgrade)` adds fields and supplies a **total**
function that turns the previous value into the new one — every old item has a
defined image in the new shape:

```ts
const SettingsV1 = EntityESchema.make('Settings', 'settingsId', {
  theme: Schema.String,
}).build();

const SettingsV2 = EntityESchema.make('Settings', 'settingsId', {
  theme: Schema.String,
})
  .evolve('v2', { fontSize: Schema.Number }, (prev) => ({
    ...prev,
    fontSize: 14, // every v1 item gets a fontSize
  }))
  .build();
```

The envelope's `_v` records the version an item was written at. A V1 item carries
`_v: 'v1'`; a V2 entity knows how to read it.

## Forward on read, migrate on write

Build one entity per schema version on the same table. A V1 entity writes a V1
item. Read that item through the **V2 entity** and it decodes _forward_ — the
upgrade function fills `fontSize`, so `get` returns the V2 shape even though the
stored `_v` is still `v1`. Reads never break on an old item.

When you `update` a stale item through the V2 entity, it **auto-migrates**:
the upgrade runs, the item is rewritten at `_v: 'v2'`, and your patch is applied
on top. Migration is lazy and free — it happens the next time you touch the item.

::test-group{id=evolve-and-migrate}
