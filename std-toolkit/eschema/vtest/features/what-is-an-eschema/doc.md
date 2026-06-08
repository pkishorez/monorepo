# What an ESchema is

Before any evolution, start with the simplest possible schema: one version.
Even then, an `ESchema` is not quite an Effect Schema — it is a **versioned**
schema, and that difference shows up the moment you encode.

## A schema is a chain of versions

You declare fields with `ESchema.make`, then `.build()` to freeze it:

```ts
const User = ESchema.make({
  name: Schema.String,
  age: Schema.Number,
}).build();
```

A single-version schema is the degenerate case of the real model: a chain of
versions from `v1` to the latest. With one version the chain is just `v1`.

## Encode stamps `_v`; decode reads it

The one thing that sets an evolving schema apart: **encode always writes the
latest version and stamps it with `_v`.** That stamp is what lets a future
`decode` know which version a stored row was written under. With a single
version, encode adds `_v: 'v1'` and decode reads it straight back — a faithful
round-trip, with the version stamp as the only addition.

Everything returns an `Effect`, so we run these examples with `Effect.runPromise`
inside the tests.

::test-group{id=round-trip}
