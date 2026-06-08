# The single entity

Some data is inherently singular: app config, feature flags, the last-synced
cursor. Modelling that as a keyed collection forces a fake id like
`"the-only-one"`. A `DynamoSingleEntity` is the cleaner drawer: exactly one
item, no id, and a **mandatory default** so reads never come back empty.

```ts
const AppConfig = DynamoSingleEntity.make(table)
  .eschema(configSchema) // a SingleEntityESchema — no idField
  .default({ theme: 'light', maxRetries: 3 });
```

The default is the killer feature: `get()` never returns `null`. Before anything
is written it returns the default value with a synthetic envelope whose `_u` is
the empty string — that empty `_u` is how you tell "never written" from
"written".

## get / put / update

The surface is three operations and none take a key:

- `get()` — the item, or the default; always present
- `put(value)` — write unconditionally (upsert)
- `update({ update })` — patch an existing item; **fails** with `NoItemToUpdate`
  if nothing was ever written (there's no item to merge onto)

Note the single-entity envelope has no `_d` — a single item is either present or
sitting at its default, so a soft-delete flag would be meaningless.

::test-group{id=default-and-write}
