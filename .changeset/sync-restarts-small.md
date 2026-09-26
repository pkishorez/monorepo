---
'std-toolkit': patch
---

`std-toolkit/sync` is rebuilt around a much smaller surface. A Std Sync is `createStdSync({ name, platform, runtime, onEvent, options })` with `collection` and `dispose`. `app.collection(schema, { sync: { global, partitions }, settleWindow, onInsert, onUpdate, onDelete, options })` takes the schema as its first argument; `sync.total` is now `sync.global`, and a partition factory returns a strategy directly instead of `{ strategy, repair }`.

Strategies are `strategy.oldToNew({ fetch, subscribe, pollEvery })`, `strategy.newToOld({ fetch, fetchOlder, subscribe, pollEvery })`, and `strategy.make({ name, state, initial, run })`, where `run` returns a Stream of `{ entities, state }` and the engine stores each yield in one write. `syncStrategy`, `bidirectional` (use `newToOld`), and the `paginated` / `poll` / `live` / `once` / `subscribe` source builders are removed. Cadence Repair and the `cadence` option are replaced by a Collection-level `settleWindow`, off by default, and the `_s` and `_c` fields are removed from Entity meta.

A Platform is now `{ store, leadership, doorbell }`. `memory()` is the default; `browser({ databaseName, leadership, doorbell })` from `std-toolkit/sync/platform/browser` brings IndexedDB, Web Locks, and a BroadcastChannel Doorbell, and the same subpath adds `listStdSyncs` and `deleteStdSync`. The default IndexedDB database is now `std-sync:<name>`. Peer Sync, `storeLayer` / `leadershipLayer`, `broadcastChannel`, and `std-toolkit/sync/leadership/in-memory` are removed. Each Session has its own lock, so different tabs may lead different Partitions.

Removed for now, to return as separate layers: the Outbox and Offline Actions (`outbox`, `createOfflineAction`, `OutboxUnreachable`), single-item collections (`singleItemCollection`, `singleItemSync`), `reset`, `registry`, `std.sync`, the `flow` and `version` options, and the collection `utils`. Pacing is only on `std-toolkit/sync/paced`. Sync Events are now `SessionFailed`, `OutdatedApplication`, and `PlatformClosed`.
