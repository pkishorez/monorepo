# Bulk migration

On-read and on-update migration brings items forward _as you touch them_. But
sometimes you want every item on the latest version now — to drop a backfill, to
retire the old upgrade code, or to know the whole table is canonical. That is
`registry.migrate()`: a single pass that scans the table, rewrites every stale
item to the latest schema, and hands back a structured report.

## A dry run, then the real thing

`migrate({ dryRun: true })` scans and reports what _would_ change without writing
anything — the safe way to size a migration. `migrate({ dryRun: false })` does
the rewrite. Both return a `MigrationReport`; its `items` counters tell the
story:

```ts
const plan = yield * registry.migrate({ dryRun: true });
// plan.items: { scanned, ignored, migrate, migrated, failed }
//   migrate  = how many stale items were found
//   migrated = 0 on a dry run (nothing was written)

const done = yield * registry.migrate({ dryRun: false });
// done.items.migrated = how many were actually rewritten
```

## What a migrate pass guarantees

After a non-dry run completes, every stale item has been rewritten at the latest
`_v`, with its derived keys and secondary-index columns recomputed from the
migrated value. A second `migrate` over the same table finds nothing to do —
migration is idempotent. The report also carries `phase`
(`completed` / `completed-with-failures`) and a per-entity breakdown, so a
migration is observable rather than a black box.

::test-group{id=migrate-table}
