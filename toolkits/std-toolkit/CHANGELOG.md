# @kestack/std-toolkit

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @kestack/kabuki@0.0.3

## 0.0.3

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - - New `replica` door: Kabuki-native sync into `@tanstack/db` Collections, by Windows, with Caught Up and Never Synced per scope.
  - Breaking: every table declares a mode, `persistent` or `disposable`; setup refuses a persistent table's breaking change.
  - Breaking: plain `Schema.Number` is refused; `expectTableSnapshot` is `expectTableShippable`.
  - Breaking: `retired` is gone from `Store.idb`; `store.prune` and `IDB.prune` keep only what is named.
  - The `studio-rpc` door is gone.
- Updated dependencies [[`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1)]:
  - @kestack/kabuki@0.0.3

## 0.0.2

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: Sync adapters are named like Table adapters. `Sync.idb()` (`./sync/idb`) and `Sync.memory()` (`./sync/memory`) replace `browser()` and `memory()`, and `./sync/platform/browser` is gone. `createStdSync({ platform })` is now `createStdSync({ store })`, and Partitions are now Windows (`sync: { windows }`). An ESchema keeps `_v` on the wire, so an older or unversioned value sent over RPC is refused instead of migrated; stored values still migrate when read. Needs Effect `^4.0.0`; the optional `react` peer accepts any React 19.

  New: `sharedBroadcaster(name)` lets every tab hear a write made in another; `inOrder()` sends each key's writes in the order they were made; disposing a Sync waits up to five seconds for writes on their way; `newToOld` shows the newest page first after a reload. A batch refused before submission reports its other ops as `not-evaluated` rather than `passed`.
