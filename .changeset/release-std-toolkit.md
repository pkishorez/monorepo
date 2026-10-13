---
'@kstackz/std-toolkit': patch
---

Breaking: Sync adapters are named like Table adapters. `Sync.idb()` (`./sync/idb`) and `Sync.memory()` (`./sync/memory`) replace `browser()` and `memory()`, and `./sync/platform/browser` is gone. `createStdSync({ platform })` is now `createStdSync({ store })`, and Partitions are now Windows (`sync: { windows }`). An ESchema keeps `_v` on the wire, so an older or unversioned value sent over RPC is refused instead of migrated; stored values still migrate when read. Needs Effect `^4.0.0`; the optional `react` peer accepts any React 19.

New: `sharedBroadcaster(name)` lets every tab hear a write made in another; `inOrder()` sends each key's writes in the order they were made; disposing a Sync waits up to five seconds for writes on their way; `newToOld` shows the newest page first after a reload. A batch refused before submission reports its other ops as `not-evaluated` rather than `passed`.
