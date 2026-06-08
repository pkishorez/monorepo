# `NullOr` over `optional`

When you add a field that old rows don't have, you face a choice: make it
**optional** (the key may be absent) or make it **nullable** (the key is always
there, sometimes `null`). eschema has a firm opinion: **reach for
`Schema.NullOr`, not `Schema.optional`.**

## Why `null` beats "absent"

Migrations are **total functions** — they run on every read and must produce a
complete value. An optional field undermines that in two ways:

- Every downstream migration has to branch on `undefined`, because the field
  might or might not be there.
- The encoded shape becomes unstable: two records of the "same" version can
  differ by whether a key exists.

With `NullOr` the field is **always present** with a definite value. When you
add it, default it to `null` in the migration; "no value yet" is represented
explicitly, and every later migration sees a field that is always there:

```ts
const Profile = ESchema.make({ name: Schema.String })
  .evolve('v2', { bio: Schema.NullOr(Schema.String) }, (prev) => ({
    ...prev,
    bio: null, // explicit "no value", not an absent key
  }))
  .build();
```

Now a migrated v1 row has `bio: null` — present and definite — and any future
migration can treat `bio` as a field that always exists.

::test-group{id=null-default}
