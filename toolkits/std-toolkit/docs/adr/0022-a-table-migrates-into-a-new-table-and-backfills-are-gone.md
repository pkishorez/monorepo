# A table migrates into a new table, and Backfills are gone

This supersedes ADR 0020. Backfills are removed, and so are gap versions and `NeedsBackfill`.

**Entities evolve only by pure migrations.** Every version after v1 has a migration again. When an index or key derivation changes on a persistent table, setup reindexes the affected entities by itself, with nothing declared: it scans, rewrites each row whose index keys drifted (`drift`, `reindex`, ADR 0007), and records the Stored contract only after the scan. A crash leaves the old contract, so the next setup reindexes again. That is safe because a reindex is idempotent, and it needs no progress rows. DynamoDB adds a new global secondary index first, as before. A disposable table still wipes on any change that is not safe.

**A change no pure migration can make is a new table.** You declare a new StdTable on a new physical table. Its ESchemas start again at v1, its snapshot starts fresh, and nothing in it mentions the old one. Then you write one standalone helper:

```ts
StdTable.migrate(oldBoard, board, {
  Project: (project, { old, next }) => next.Project.insert(...),
  Task: (task, { old, next }) => ...,
});
```

It has one handler per entity of the old table, and the keys are exhaustive. Each handler gets one old row at its latest value, read-only access to the old table, and write access to the new one. It can write one row, several, or none. The old table stays in code, frozen, until every database has migrated. Then the old table and the `migrate` call are deleted together, and so is all of the old version history.

`migrate` returns a `Stream` of progress events and needs both tables as layers. It keeps one migration row in the new table's Stored contract: the source (logical name and contract hash), its state (`running` or `done`), the attempt number, and the counts so far. A run:

1. stops with `Skipped` if the row says `done` from the same source. It fails if the row says `done` from another source, or if there's no row and the new table already holds rows, since that table is already in use;
2. checks that the old table's Stored contract matches the old table's declaration, so the typed reads are valid. An old table with no contract (for example a fresh environment) migrates as empty;
3. writes `running`. If a crashed run left `running` behind, it first clears the new table and starts over;
4. scans the old table page by page, sends each row to its entity's handler, and emits progress with an estimated total after each page;
5. writes `done` only after every row is through.

Any handler failure fails the whole run, and the next run starts from scratch.

`migrate` is a plain function. It runs wherever you call it: at deploy in an Alchemy migration resource, before the Worker that serves the new table, for D1 and DynamoDB; or at app open, before the new table is used, for SQLite and IndexedDB. For now it runs in one process. The target must be a persistent table: a disposable one starts empty instead.

**What it does not guarantee yet.** The old table isn't frozen while the migration runs, so a write the old Worker makes after the scan passed its row is lost. A device that never ran a migration before it was deleted starts empty. Freezing the old table, and spreading a run across Workers, come later.

## Considered Options

- **Backfills on the table, filling gap versions** (ADR 0020): rejected. A Backfill reads other entities at a moment in the table's history, but each entity keeps evolving on its own. A Task Backfill written against Project v2 breaks once Project moves to v3 and no longer holds what it read. Ordering, dependency tracking and progress rows all followed from that.
- **Table steps that name the entity versions they read**: rejected. They are correct, but every old step has to keep reading frozen versions forever, and the history never shrinks.
- **A migration declared on the new table**: rejected. The new table would carry the old one's types forever. A standalone helper is deleted on its own.
- **Freezing the old table during a run** (a write-blocking trigger on D1 and SQLite, a deny-writes resource policy on DynamoDB): deferred, not rejected.
- **Skipping rows a handler fails on**: rejected. That loses data quietly, and starting over is cheap at this scale.
