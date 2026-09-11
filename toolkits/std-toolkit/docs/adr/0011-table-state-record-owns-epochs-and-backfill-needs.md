# The table state record owns entity epochs and backfill needs

The reserved item table-level enforcement kept at a fixed key held one thing: the approved `TableSnapshot`. std-toolkit widens that item into a **table state record** that the table keeps about itself, read through `table.state()`: the enforcement baseline as before, one **epoch** per registered entity, and every **backfill need** enforcement has accepted but nothing has repaired. The key and the entity marker do not change, and an item written in the old bare-snapshot form still reads as a state whose only content is that baseline, so tables already carrying one need no migration.

## Decision

An entity epoch is a ULID that changes whenever every replica of that entity must be dropped and refetched. Enforcement mints one the first time it sees an entity. `dangerouslyRemoveAllItems` on an entity renews that entity's epoch, and on a table renews every registered entity's epoch, because rows removed without tombstones are invisible to a cursor-based reader and only an epoch change can tell it to start over. A schema evolution never moves an epoch — read migration already bridges it. A single `hardDelete` never moves it either: it is one row, it broadcasts a tombstone to live subscribers, and renewing a whole entity's epoch for one row would be far too blunt; tombstone-first deletion with a later purge is the answer there (see the backlog).

A backfill need is one `requires-backfill` snapshot change — an added or edited access pattern, an added or changed physical index — with the ULID of the enforcement run that recorded it. Enforcement appends needs and never settles them; a subject already owed keeps its earlier stamp. A whole-table wipe settles every need, since there are no rows left to repair. Settling a need by repairing rows is the job of the backfill command the backlog proposes, which is why the record stores the exact subjects: the command reads them to know what to scan for and clears them when it is done.

A table wipe keeps the baseline. Wiping is about rows; the baseline is about the contract the code declares, and the two stay independent so `verifySnapshot` behaves the same before and after.

The record is itself an ESchema (`StdTableState`, at `v1`), so its shape evolves the way every stored row does: a later field is an appended `evolve` step with a migration, and a record written today still reads. The snapshot rides inside it as an opaque field, validated against `TableSnapshotSchema` right after decode, because that schema carries a filter the ESchema field policy refuses. The ESchema is not registered on any table, so it never appears in a table's own snapshot.

Every write of the record is guarded on the `_u` it read and retried a bounded number of times, the same optimistic loop enforcement already used, so an entity wipe and an enforcement run racing on one table recheck each other rather than overwrite. An update that leaves the state unchanged writes nothing.

## Consequences

The epoch is the backend-owned counterpart of sync's store-wide `version` knob, scoped to one entity and moved by the operation that invalidates replicas instead of by a developer editing a constant. Sync does not read it yet; the client-side gate — comparing a collection's stored epoch against the backend's and wiping only that replica — is the next slice, and is recorded in the backlog with its proposed API. `dangerouslyRemoveAllItems` now returns the new epoch(s) beside `itemsDeleted` so a backend can hand them straight to whatever it exposes to clients.

The record lives in a new `std-table/state` module that both enforcement and the entity surface depend on, since an entity wipe must move an epoch without importing enforcement. The count `dangerouslyRemoveAllItems` returns for a table excludes the record, so it still means the caller's rows.

Rejected: keeping a separate record per concern (three reserved keys would need three guarded writes to stay consistent, and the wipe touches all three); naming the field `version` (collides with the eschema version every encoded row carries, which this deliberately is not); moving the epoch on `hardDelete` of one row; and dropping the baseline on a table wipe.
