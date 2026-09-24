---
'std-toolkit': minor
---

Table-level enforcement now runs inside every adapter's `setup`, with no way around it, and `table.verifySnapshot()` is removed. `setup` creates the physical table if missing, diffs the current shape against the baseline stored inside the table, and only then reconciles indexes and commits the new baseline; a breaking change is refused with `SnapshotIncompatible`, and a table that already holds rows but no baseline is refused with `BaselineMissing`. Memory gains a no-op `setup`. The baseline now also records a version floor per entity and the owed backfills it accepted, for Std Studio to consume.

The `std-toolkit snapshot` CLI, its `std-toolkit.snapshot.ts` entry, and the file-based baseline are removed. The recommended test is `expectTableSnapshot(table, file)` from `std-toolkit/snapshot/vitest`: one committed JSON file per table holding the schema contract plus golden rows for every migration step, so a rewritten migration fails as `breaking` in CI.

Every snapshot document is now an ESchema at `v1`, with no migration from the previous formats. A table deployed before this release holds a baseline in the old format: delete its reserved enforcement item once before the first new `setup`, which then bootstraps a fresh baseline. `TableSnapshotSchema`, `ESchemaSnapshotSchema`, `ContractSnapshotSchema`, and `SnapshotFormatRetired` are replaced by `TableSnapshotESchema`, `ESchemaSnapshotESchema`, and `TableSnapshotFileESchema`. A nested ESchema's composition now declares its persisted form (fields plus `_v`) on its encoded side.
