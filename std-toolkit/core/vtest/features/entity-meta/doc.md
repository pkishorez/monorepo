# Entity meta: the four bookkeeping keys

`MetaSchema` is the runtime shape of an entity's `meta`. It carries exactly four
keys, each a single letter prefixed with `_` so it never shadows a domain field
and stays cheap to store on every row:

```ts
const MetaSchema = Schema.Struct({
  _v: Schema.String, // schema version the value was written under
  _e: Schema.String, // entity name (which kind of thing this is)
  _d: Schema.Boolean, // soft-delete flag
  _u: Schema.String, // updated-at stamp
});
```

Each key earns its place:

- **`_v`** is the same version stamp `eschema` uses to fold old data forward. It
  lives in meta so a backend can read it without decoding the value.
- **`_e`** lets a single store hold many entity kinds and still tell them apart.
- **`_d`** is a _soft_ delete: the row stays, flagged. This is what makes
  deletions visible to broadcast and sync instead of silently vanishing.
- **`_u`** is the last-updated stamp used for ordering and conflict checks.

The keys are required and typed. A boolean `_d`, for instance, cannot arrive as
the string `"false"` — the schema rejects it, so downstream code never has to
defensively coerce.

::test-group{id=meta-keys}
