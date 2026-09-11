---
'std-toolkit': patch
---

Widen the reserved enforcement item into a table state record, read through `table.state()`: the approved baseline as before, plus one epoch per entity and every backfill need enforcement has accepted but nothing has repaired.

- `verifySnapshot` mints an epoch for each entity it first sees and records `requires-backfill` changes as owed subjects instead of only warning about them.
- `dangerouslyRemoveAllItems` on an entity renews that entity's epoch and returns it; on a table it renews every registered entity's epoch, settles every backfill need, keeps the baseline, and returns the new epochs. The item count still means the caller's rows.
- A baseline stored in the old bare-snapshot form still reads, and is restamped on the next write; the reserved key and entity marker are unchanged.
- `SnapshotSubjectSchema` is exported from `std-toolkit/snapshot`; `TableState`, `EntityState`, and `BackfillNeed` are exported from `std-toolkit/db`.

The epoch is the backend-owned replacement for hand-bumping sync's store-wide `version`; the client-side gate that reads it is the next slice (see `docs/backlog.md`).
