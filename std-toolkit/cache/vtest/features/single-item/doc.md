# The single item

Not everything is a collection. Some data is inherently singular: the current
session, the active feature flags, the last-synced timestamp. Forcing those
into a keyed collection means inventing a fake id like `"the-only-one"`. Cache
gives you a cleaner drawer for this: `CacheSingleItem<T>`.

## One slot, no id

A single item holds exactly one record. You ask the store for it by name only —
there's no `idField`, because there's no key:

```ts
const session = yield * store.singleItem<Session>({ name: 'Session' });
```

Its surface is just three operations, and they need no id:

- `put(envelope)` — set the slot
- `get()` — read the slot, as an `Option`
- `delete()` — empty the slot

Note the envelope here is a `SingleEntityType<T>`: same idea as before, but its
`meta` has no `_d` flag — a single item is either present or absent, so a
soft-delete flag would be redundant.

::test-group{id=slot}

## Put replaces; delete clears

Because there's only one slot, `put` always overwrites whatever was there, and
after `delete` a `get` returns `None`. There is no "list" — singular means
singular.

::test-group{id=replace-and-clear}
