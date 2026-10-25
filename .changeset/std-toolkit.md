---
'@kestack/std-toolkit': patch
---

- New `replica` door: Kabuki-native sync into `@tanstack/db` Collections, by Windows, with Caught Up and Never Synced per scope.
- Breaking: every table declares a mode, `persistent` or `disposable`; setup refuses a persistent table's breaking change.
- Breaking: plain `Schema.Number` is refused; `expectTableSnapshot` is `expectTableShippable`.
- Breaking: `retired` is gone from `Store.idb`; `store.prune` and `IDB.prune` keep only what is named.
- The `studio-rpc` door is gone.
