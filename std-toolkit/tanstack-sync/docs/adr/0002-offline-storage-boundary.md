# Offline storage boundary

Offline Storage is a grouped key-value abstraction owned by `tanstack-sync`, not a reuse of the older entity-aware storage package. The core storage module stays internal and package exports are tightened to expose only the root API plus `./offline-storage/idb`, because Source of Truth and Sync State need a lower-level durable store and future readers should not import engine storage internals directly.

The public IndexedDB adapter path is `@std-toolkit/tanstack-sync/offline-storage/idb`, and its factory is `idbStorage({ name, version? })`; `name` identifies the sync storage database, and `version` is a string or positive integer data-reset version that clears all data in that database when it changes. The adapter fails explicitly when IndexedDB is unavailable and never silently falls back to memory.

Offline Storage groups store serializable plain data. `putMany` is an all-or-nothing operation so Source-of-Truth batch writes remain atomic when persistence is enabled.

The engine owns group naming: Source of Truth uses `sot/{schema.name}` and Sync State uses `state/{schema.name}`.

The IndexedDB adapter uses one object store for all app data groups, with compound primary key `[group, key]` and a group index for `getAll` and group clearing. It also uses a private metadata object store for the adapter's data-reset version. Groups are runtime namespaces, not IndexedDB object stores, so collection creation does not require database version upgrades.

**Considered Options**

- Reuse the older entity-aware storage package: rejected because it carries entity-specific methods such as latest/oldest lookup from the old cursor-derivation model.
- Export `offline-storage` as a public package subpath: rejected because the storage contract is an engine boundary; users only need concrete adapter factories such as IndexedDB.
