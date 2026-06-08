# Evolving an object's fields

This is the reason the package exists. Your schema needs a new field, but you
already have rows persisted under the old shape. With `.evolve` you describe
_what changed_ and _how to fill the gap_ for old rows — and eschema replays that
on read.

## A delta plus a migration

`.evolve` takes three things: the new version label, a **delta** (only the
fields that changed), and a **migration** that upgrades a value from the
previous version to this one:

```ts
const User = ESchema.make({ name: Schema.String })
  .evolve('v2', { email: Schema.String }, (prev) => ({
    ...prev,
    email: 'unknown@example.com',
  }))
  .evolve('v3', { verified: Schema.Boolean }, (prev) => ({
    ...prev,
    verified: false,
  }))
  .build();
```

Two rules make this safe:

- The delta is **merged onto** the previous version — `{ field: Schema.X }` adds
  or replaces a field, `{ field: null }` removes one.
- The migration is **pure and one-step**: it only handles the _immediately
  previous_ version. eschema chains them, folding `v1 → v2 → v3` on decode.

## Decode folds forward; v1 is frozen

A row written long ago at v1 carries only a name. `decode` reads its `_v`, then
runs every migration in order until the value matches the latest shape. Because
unstamped data also decodes as v1, **v1 is frozen** — never edit its fields once
data exists, only ever move forward with `.evolve`. Versions advance one step at
a time; you cannot skip from `v1` to `v3`.

::test-group{id=fold-forward}
