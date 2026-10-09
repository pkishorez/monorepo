---
'@kstackz/std-toolkit': patch
'@kstackz/ai-toolkit': patch
---

Sync adapters are named like Table adapters. `Sync.idb()` (`@kstackz/std-toolkit/sync/idb`), `Sync.sqlite({ database })` (`/sync/sqlite`) and `Sync.memory()` (`/sync/memory`, also on `/sync`) replace `browser()`, `expo()` and `memory()`; `listStdSyncs` and `deleteStdSync` become `Sync.idb.list` / `Sync.idb.remove` and `Sync.sqlite.list` / `Sync.sqlite.remove`. The `StdSyncPlatform` type is now `SyncStore` (its `store` field is `table`), `createStdSync({ platform })` is `createStdSync({ store })`, and the `PlatformClosed` Sync Event is `StoreClosed`. Sync's Partition is now a Window: `sync: { partitions }` is `sync: { windows }`, `PartitionMap` is `WindowMap`, and `SessionFailed` carries `windowKey`. The `./sync/platform/browser` and `./sync/platform/expo` subpaths are gone. ai-toolkit's `makePlaygroundSync` takes `store` instead of `platform`.
