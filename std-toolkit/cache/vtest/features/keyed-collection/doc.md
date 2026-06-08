# The keyed collection

Most data comes in pluralities: _all the users_, _every cached message_, _the
products we've seen_. For that, cache gives you a `CacheEntity<T>` — a drawer of
many envelopes, each addressed by an id.

## Getting a collection

You ask the store for one by name, telling it which field of `value` is the id:

```ts
const users = yield * store.entity<User>({ name: 'User', idField: 'id' });
```

Now `users` is a small CRUD surface over envelopes:

- `put(envelope)` — insert or **replace** by id
- `get(id)` — one record, as an `Option`
- `getAll()` — every record
- `delete(id)` / `deleteAll()` — remove one or all

## Addressed by id, so put is an upsert

Because records are keyed, a `put` with an id that already exists doesn't add a
duplicate — it overwrites. This is what keeps the collection a _set keyed by
id_, not an append log. Two puts of `u1` leave exactly one `u1`.

::test-group{id=put-get}

## Reading and removing in bulk

`getAll()` returns the whole drawer (order is not guaranteed — that's what the
next feature is for). `delete(id)` removes one record while leaving its
neighbours; `deleteAll()` empties the drawer.

::test-group{id=get-all}

::test-group{id=delete}
