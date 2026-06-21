# tanstack-sync — Implementation Notes

This document records the accepted Offline Storage implementation shape for maintainers.
The public user-facing API stays narrow; the storage root module is internal to the
package.

## Public package surface

`package.json` exposes exactly these subpaths:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./paced": {
      "types": "./dist/paced/index.d.ts",
      "default": "./dist/paced/index.js"
    },
    "./offline-storage/idb": {
      "types": "./dist/offline-storage/adapters/idb/index.d.ts",
      "default": "./dist/offline-storage/adapters/idb/index.js"
    }
  }
}
```

Root imports:

```ts
import {
  createStdSync,
  syncStrategy,
  singleItemSyncStrategy,
  paceStrategy,
} from '@std-toolkit/tanstack-sync';
```

IndexedDB adapter import:

```ts
import { idbStorage } from '@std-toolkit/tanstack-sync/offline-storage/idb';
```

The only public storage subpath is `@std-toolkit/tanstack-sync/offline-storage/idb`.
Do not expose the internal storage root as a package subpath.

## Offline Storage deep module

The `src/offline-storage/` folder is a deep module. `index.ts` is a pure internal barrel
for engine code.

```text
src/offline-storage/
  index.ts
  types.ts
  group-name.ts
  memory-offline-storage.ts
  offline-storage-error.ts
  resolve-offline-storage.ts
  adapters/
    idb/
      index.ts
      idb-storage.ts
      internals.ts
  __tests__/
    idb-storage.test.ts
    memory-offline-storage.test.ts
    offline-storage-api.test.ts
    setup.ts
```

Internal engine imports may use `src/offline-storage/index.ts` for:

- `OfflineStorage`
- `OfflineStorageGroup`
- `OfflineStorageSetting`
- `resolveRootOfflineStorage`
- `resolveCollectionOfflineStorage`
- `offlineStorageGroupName`

Users configure storage through `offlineStorage` and import only `idbStorage`.

## Configuration and resolution

`createStdSync` accepts root defaults:

```ts
createStdSync(defaults?: {
  options?: StdCollectionOptions;
  offlineStorage?: OfflineStorage | false;
});
```

Keyed collections accept:

```ts
std.sync({
  schema,
  offlineStorage?: OfflineStorage | false,
  // ...
});
```

Single-item collections accept:

```ts
std.singleItemSync({
  schema,
  offlineStorage?: OfflineStorage | false,
  // ...
});
```

Resolution semantics:

- Missing root `offlineStorage` uses one root memory backend for the `createStdSync`
  instance.
- Root `offlineStorage: idbStorage(...)` makes collections inherit that durable backend.
- Root `offlineStorage: false` creates a root memory backend.
- Missing collection `offlineStorage` inherits the resolved root backend.
- Collection `offlineStorage: idbStorage(...)` overrides the root backend for that
  collection.
- Collection `offlineStorage: false` uses collection-local memory, even when the root is
  durable.
- Storage read or write failures are surfaced. There is no silent fallback from a failing
  durable backend to memory.

## Group names and keys

The engine owns storage group names:

- Source of Truth group: `sot/{schema.name}`
- Sync State group: `state/{schema.name}`

Keyed collection keys:

- SoT key: entity id as a string.
- Global strategy Sync State key: `__total__`.
- Partition strategy Sync State key: the serialized partition identity returned by the
  partition router.

Single-item keys:

- SoT key: `__singleton__`.
- Sync State key: `__single__`.

These names are implementation details. User code should not construct group names or keys.

## Source of Truth and Sync State

SoT and Sync State are backed by the resolved Offline Storage backend. The storage backend
is live state, not a reload-only hydration copy.

Keyed SoT uses one group per collection. `writeUpsert` and strategy writes read current
stored entities, apply convergence, then write accepted entities atomically. Tombstones stay
in SoT so older entities cannot resurrect deleted rows. If the TanStack collection is
unmounted, projection is skipped but the stored SoT remains authoritative.

Single-item SoT uses the same convergence rule against the `__singleton__` key.

Sync State is serializable strategy-owned data. The engine stores it under an envelope:

```ts
{ strategy: string, value: unknown }
```

The strategy declares its stable strategy name, runtime schema, and empty state. On read, the
engine checks the stored strategy name, decodes `value` with the current strategy schema,
and returns typed state to `run(ctx)`. If the name differs, legacy raw state is found, or
schema decoding fails, the engine logs a warning, writes the current strategy's empty state
envelope, and continues from that empty state. Strategies must write server truth first and
then advance state.

## Error mapping

Storage failures map to:

```ts
{ _tag: 'Storage', reason: string, cause?: unknown }
```

This is the `WriteError.Storage` case. It is used for SoT reads/writes and Sync State
reads/writes. Strategy `run` and `writeUpsert` return `Effect.Effect<void, WriteError>` so
callers can handle storage failures explicitly.

## IndexedDB adapter

`idbStorage({ name, version })` creates the public durable adapter.

- `name` is the IndexedDB database name.
- `version` is a string or positive integer data-reset version; changing it clears the
  adapter's data.
- The adapter uses one object store for all groups, plus a private metadata object store for
  the data-reset version.
- Records are stored under compound primary key `[group, key]`.
- A group index supports `getAll` and group clearing.
- Groups are runtime namespaces, not IndexedDB object stores, so collection creation does
  not require database upgrades.
- If IndexedDB is unavailable, adapter construction fails explicitly.

`putMany` is all-or-nothing so Source-of-Truth batch writes remain atomic when persistence
is enabled.
