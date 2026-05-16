---
title: registry.migrate
order: 2
---

# registry.migrate / migrateStream

Walks the entire table (optionally in parallel scan segments),
classifies every row via the owning entity's
[`inspectMigration`](../../entity/migration/index.doc.md), and — when
not in `dryRun` — rewrites stale rows with the canonical bytes
returned by `migrationWriteIntent`. Stream-shaped so progress can be
observed live.

## Usage

```ts
// One-shot report (dry-run by default)
const report = yield * registry.migrate();
report.totals.stale; // count

// Live progress
yield *
  registry
    .migrateStream({ dryRun: false })
    .pipe(Stream.runForEach((snapshot) => Effect.log(snapshot)));
```

## API

| Option                        | Default                               | Meaning                                               |
| ----------------------------- | ------------------------------------- | ----------------------------------------------------- |
| `dryRun`                      | `true`                                | Classification only — no rewrites.                    |
| `entities`                    | `undefined` (= all registered)        | Restrict to a named subset.                           |
| `scan.pageLimit`              | `batchSize`                           | DynamoDB `Limit` per page.                            |
| `scan.totalSegments`          | `1`                                   | Number of parallel scan segments.                     |
| `scan.consistentRead`         | unset                                 | Pass-through.                                         |
| `concurrency.itemsPerSegment` | `1`                                   | Per-segment item inspection concurrency.              |
| `progress.estimatedTotal`     | `table.describe().estimatedItemCount` | Total to report progress against, or `false` to skip. |

## Examples

### Subset migration

```ts
yield * registry.migrate({ entities: ['User'], dryRun: false });
```

### Parallel scan

```ts
yield *
  registry.migrate({
    scan: { totalSegments: 8, pageLimit: 500 },
    concurrency: { itemsPerSegment: 4 },
    dryRun: false,
  });
```

## Edge cases

- **`dryRun: true` is the default.** Misuse-resistance: a `migrate()`
  call with no options never rewrites the table.
- **Rewrites are conditional.** Every put issues a
  `cond(pk = stored, sk = stored, _e = stored, _u = stored)` (plus
  `_d` for regular entities). A concurrent writer that touched the
  row in the meantime invalidates the migration write, and the
  migrator re-inspects the new row up to `MIGRATION_RETRY_LIMIT`
  (3) before giving up.
- **Conditional conflicts trigger a re-inspect-then-retry loop.** The
  migrator reads the row again with `ConsistentRead: true`,
  re-classifies it, and if it is still stale re-derives the canonical
  bytes and retries. Non-stale → `resolved`. Missing → `resolved`.
- **Throttling / 503 are retried up to `MIGRATION_RETRY_LIMIT`.**
  `ThrottlingException`, `ServiceUnavailable`, and `RequestTimeout`
  are considered recoverable.
- **Rows with no `_e` are `ignored`.** They never reach an entity's
  inspector.
- **`entities` filter narrows the inspector set.** A row whose `_e`
  is not in the filter is `ignored` even if a matching entity is
  registered.
- **`migrate()` is `migrateStream(...).runLast`.** The two share all
  semantics; the streaming variant emits a snapshot per page so
  progress dashboards can show partial work.

## Tests
