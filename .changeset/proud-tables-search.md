---
'std-toolkit': patch
---

Rebuild sync persistence on `StdTable` and converge collections across browser
tabs.

**Breaking:** the sync-specific offline storage adapters are gone.
`OfflineStorage`, `StorageDescriptor`, and the
`std-toolkit/tanstack-sync/offline-storage/idb` subpath have been removed. Pass
any `StdTable`-backed layer instead, built from the exported
`syncPersistenceTable`:

```diff
-createStdSync({ offlineStorage: idbStorage({ name: 'app' }) });
+createStdSync({ persistenceLayer: IDB.make(syncPersistenceTable, { database }).layer });
```

`SyncPersistenceLayer` types that layer. When omitted, sync persists to an
in-memory table.

**Breaking:** `createStdSync` defaults are now `runtime`, `onEvent`, `flow`,
`cadence`, `persistenceLayer`, and `notices`, and the instance exposes
`dispose()` alongside `sync`, `collection`, `singleItemSync`,
`singleItemCollection`, and `registry()`. Using an instance after `dispose()`
throws. `ForwardFetch` and the `SyncInspector` / `Inspector*` types are removed;
`EffectRuntime`, `FlowPlacement`, `SyncEvent`, `SyncReporter`, `StdSyncDefaults`,
`SyncConfig`, and `SingleItemSyncConfig` are exported in their place.

Add cross-tab convergence. Sync collections that share local persistence now
stay in step across browser tabs: durable projection positions plus a
`BroadcastChannel` change notice let every tab project a confirmed write without
re-fetching it. Configure with `createStdSync({ notices: { scope, channel } })`.
`ChannelFactory` and `ChangeNoticeChannel` let non-browser hosts supply their own
transport, and environments without `BroadcastChannel` degrade to no notices.

Collections created through std-sync now default `gcTime` to 10 seconds.
TanStack DB's five-minute default arms a shared ref'd timer that keeps a Node
process alive; override per collection via `options.gcTime`.

Fix `pacedUpdate` committing against a stale row. The pacer is cached per key,
so its commit closure kept the row captured on the first call for that key,
and every paced update after the first wrote against stale data.

Fix change notices being dropped at teardown. Queued notice projections are now
tracked and awaited during cleanup, so persistence runtimes are no longer
disposed while notice work is still in flight.
