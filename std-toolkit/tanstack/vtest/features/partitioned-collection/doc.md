# The partitioned collection

Sometimes one collection of one kind is really many slices that should load
independently — the same `Task` entity, but partitioned per workspace, per
tenant, or per board. `stdPartitionedCollectionOptions` is the shape for that:
records still share a schema, but storage and loading are keyed by a
**partition field**.

## On demand, one partition at a time

A partitioned collection is inherently `syncMode: 'on-demand'` — it would make
no sense to eagerly load _every_ tenant's data. Instead, when a query filters on
the partition field (`eq` on `workspaceId`, say), the collection loads just that
slice via `onLoadPartition`, paging until the cursor stops advancing.

```ts
const config = stdPartitionedCollectionOptions({
  schema: TaskSchema,
  partitionField: 'workspaceId',
  cache: (partition) => makeCacheFor(partition), // Effect<CacheEntity<Task>>
  onLoadPartition: (partition, cursor) => fetchSlice(partition, cursor),
});
```

Two things follow from this. The config's `syncMode` is always `'on-demand'`.
And `getKey` still extracts the schema's id field — partitioning changes _where_
records are stored and loaded, not _how_ they are keyed within the collection.

::test-group{id=partition-shape}
