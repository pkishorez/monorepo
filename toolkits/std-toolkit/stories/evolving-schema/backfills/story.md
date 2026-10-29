# Backfills

You fill a field no old row holds, once, before your new code serves.

A migration only sees the row it reads. Sometimes that isn't enough: a task gets an owner that no old task recorded, or a new index needs keys that old rows were never written with.

You declare the version with no migration, then say on the table how to fill it:

```ts
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .backfill('task-owner', {
    entity: 'Task',
    to: 'v2',
    run: (task) => Effect.succeed({ ...task, owner: 'ann' }),
  })
  .build();
```

Setup runs it when the database opens or at deploy, and [an old task reads only once it has run](std-toolkit/evolving-schema/backfills/a-gap-version-reads-only-after-its-backfill). A Backfill [can read other entities](std-toolkit/evolving-schema/backfills/a-backfill-reads-another-entity) to find the value, and [a database that skipped releases catches up in one pass](std-toolkit/evolving-schema/backfills/a-database-that-skipped-releases-catches-up-in-one-pass). A `{ reindex }` Backfill [puts old rows into a new index](std-toolkit/evolving-schema/backfills/a-new-index-reindexes-old-rows).

It costs downtime: until it finishes, neither release reads every row. Data you can fetch again doesn't need it, so [a disposable table is emptied instead](std-toolkit/evolving-schema/backfills/a-disposable-table-wipes-instead-of-backfilling).
