# EntitySchema: pairing a value with its meta

`MetaSchema` validates the bookkeeping half; your `eschema` describes the value
half. `EntitySchema` joins them into one codec for the whole stored record:

```ts
const User = EntityESchema.make('User', 'id', {
  name: Schema.String,
}).build();

const StoredUser = EntitySchema(User); // Schema<{ value, meta }>
```

`EntitySchema` is a tiny generic factory. It reads the value schema off the
`eschema` you pass and wraps it as `{ value, meta: MetaSchema }`. The result is
an ordinary Effect `Schema`, so you decode a stored row in one step and get both
halves typed:

- `value` keeps the `eschema`'s type — your domain fields flow through unchanged.
- `meta` is the four-key envelope from the previous feature.

The two halves are validated together. A row whose `value` matches but whose
`meta` is malformed fails as a unit, which is exactly what you want: a record is
only valid if _both_ the data and its bookkeeping are.

Note that `value` here is the plain domain shape, not a version-stamped
`eschema` envelope — the version lives once, in `meta._v`. Core deliberately
keeps the version in one place rather than duplicating it inside the value.

::test-group{id=value-and-meta}
