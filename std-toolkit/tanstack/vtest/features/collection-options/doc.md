# The collection

The everyday shape. A **collection** holds many records of one kind, addressed
by id — the client-side echo of cache's keyed collection. You reach for
`stdCollectionOptions` whenever a TanStack query renders a list of entities:
tasks, users, messages.

## Sync modes describe where data comes from

A collection always needs a `schema`, and then a `syncMode` that decides how it
fills itself:

- **`eager`** — load everything up front via `getMore` (a cursor-paged effect).
  Best when the dataset is small and you want it all immediately.
- **`on-demand`** — load nothing until a query asks, then satisfy that query via
  `onLoadSubset`. Best for large datasets queried by filter.
- **`progressive`** — both: eagerly page in the background _and_ answer specific
  queries on demand.

```ts
const config = stdCollectionOptions({
  schema: TaskSchema,
  syncMode: 'eager',
  getMore: (cursor) => fetchPageAfter(cursor), // Effect<EntityType<Task>[]>
  onInsert: (item) => createOnServer(item),
});
```

Eager is the default-feeling mode, so its config carries `startSync: true` and
omits the explicit `syncMode` field. The on-demand and progressive modes both
surface as `syncMode: 'on-demand'` in the returned config, because to TanStack
DB they behave the same way at the sync boundary.

::test-group{id=sync-modes}

## A stable, optional id

By default a collection is anonymous. Pass `id` and it flows straight through to
the config, so two collections of the same schema (say, one per view) can be
told apart by TanStack DB's registry.

::test-group{id=collection-id}
