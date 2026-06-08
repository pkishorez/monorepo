# The entity envelope

Before you can store anything, you have to know _what_ the cache stores. The
answer is the first surprise of the package: **you never store a bare value.**
You store an envelope.

## Why an envelope?

A cache that only held your raw value would be a dumb key→blob map. It couldn't
tell you which of two records is newer, which schema version a record was
written under, or whether a record was deleted-but-kept. The toolkit solves
this once, for everyone, with `EntityType<T>`:

```ts
type EntityType<T> = {
  value: T; // your data, untouched
  meta: {
    _e: string; // entity name ("User")
    _v: string; // schema version ("v1")
    _u: string; // update key — monotonic, used for ordering
    _d: boolean; // soft-delete flag
  };
};
```

`value` is yours and the cache never reads into it. `meta` is the machinery:
it's how recency queries work, how versioned migrations stay possible, and how
the cache de-duplicates by id. You construct the envelope; the cache round-trips
it faithfully.

## The contract: what you put is what you get

The whole point of the envelope is fidelity. If you `put` an envelope and `get`
it back, both `value` and `meta` come back byte-for-byte equal — including the
`_u` you chose and the `_d` flag. The cache is a faithful courier, not an
editor.

::test-group{id=round-trip}
