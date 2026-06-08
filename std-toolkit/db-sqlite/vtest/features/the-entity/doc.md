# The entity

A `SQLiteEntity` is how you actually read and write a _kind_ of record on the
shared table. You build one from three things: the table it lives on, an
`ESchema` that validates its values, and a derivation that says how its keys are
formed.

```ts
const users = SQLiteEntity.make(table)
  .eschema(UserSchema) // name + idField + field schemas
  .primary() // pk = entity name, sk = the idField
  .build();
```

The `ESchema` carries the entity's `name` and its `idField`. That's enough for
the simplest entity: every user is stored under `pk = "User"`, `sk = <userId>`.

## Writing and reading the value

You insert a plain value — no `_v`, no keys, no metadata. The entity validates
it, derives the keys, stamps the envelope, and stores it. `get` takes the key
fields and returns the value (or `null` for a miss — a miss is never an error).

- `insert(value)` — validate, key, store; returns the value plus `meta`
- `get(key)` — fetch by primary key fields, or `null`
- `update(key, partial)` — merge a patch onto an existing record

The returned `meta` is the envelope: `_e` the entity name, `_v` the schema
version the value was encoded at, `_u` an update key that changes on every
write, and `_d` the soft-delete flag.

::test-group{id=insert-get-update}

## Delete is soft by default

`delete(key)` does **not** remove the row. It flips `_d` to `true` and bumps
`_u`, so a later `get` still returns the record but marked deleted, and sync can
observe the deletion as just another change. This is what makes the store safe
to replicate: deletions are events, not gaps.

::test-group{id=soft-delete}
