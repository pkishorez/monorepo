# Single entities: singletons without a delete flag

Not everything stored is a member of a collection. A user's settings blob, a
feature-flag document, an app-wide config — each is a **singleton**: there is
exactly one, identified by context rather than by an id among siblings. For
these, core offers a parallel pair of shapes.

`SingleEntityMetaSchema` is `MetaSchema` minus `_d`:

```ts
const SingleEntityMetaSchema = Schema.Struct({
  _v: Schema.String, // schema version
  _e: Schema.String, // entity name
  _u: Schema.String, // updated-at stamp
});
```

The soft-delete flag is gone on purpose. Soft-delete exists so a deleted member
stays visible to queries and sync while flagged. A singleton has no collection
to be queried within — it is simply present or absent. Carrying a `_d` would
imply a "deleted but retained" state that has no meaning here, so the key is
omitted rather than left to be ignored.

`SingleEntitySchema(eschema)` mirrors `EntitySchema` but pairs the value with
`SingleEntityMetaSchema`. Everything else — validating both halves as a unit,
keeping the value's domain type — is the same.

::test-group{id=no-delete-flag}
