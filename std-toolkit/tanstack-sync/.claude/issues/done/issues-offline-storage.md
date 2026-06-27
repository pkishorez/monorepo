# Issues: offline-storage

Source: `this conversation`
Repo root: `/Users/kishorepolamarasetty/CAREER/MINE/monorepo/std-toolkit/tanstack-sync`
Project commands: `pnpm test` · `pnpm lint` · `pnpm build`

## North Star

Add an internal Offline Storage layer that lets `tanstack-sync` persist Source of Truth and Sync State through interchangeable storage backends, with memory as the default and IndexedDB as the public opt-in adapter. The core storage API stays internal; users only configure `offlineStorage` and import `idbStorage` from `@std-toolkit/tanstack-sync/offline-storage/idb`. The non-negotiable correctness constraint is that storage-backed Source of Truth remains the live source for convergence, including persisted writes while a TanStack collection is unmounted. Good looks like keyed and single-item sync both using the same storage resolution rules, IndexedDB retaining SoT and Sync State across reloads, and storage failures surfacing as `WriteError.Storage` without silent memory fallback.

## Glossary

- **Offline Storage** — optional durable local storage for engine-owned Source of Truth and Sync State; users configure a backend but do not call storage groups directly.
- **Offline Storage Group** — internal named key-value namespace inside Offline Storage; SoT uses `sot/{schema.name}` and Sync State uses `state/{schema.name}`.
- **Source of Truth (SoT)** — per-collection server-confirmed entity state owned by the engine; convergence, tombstone retention, and atomic batch writes happen here.
- **Sync State** — serializable strategy-owned state addressed by partition identity; the engine stores it but never interprets it.

## Conventions

- Follow the session `AGENTS.md` rules: files are kebab-case; comments stay sparse except JSDoc for functions, classes, and complex data structures; do not edit `repos/effect-smol`.
- `index.ts` files are pure barrels. The `offline-storage` folder is a deep module: wide interior, narrow doors.
- The package currently has no local `*.test.ts` files, but `vite.config.ts` includes `src/**/__tests__/**/*.test.ts`; add focused Vitest tests and add `test: "vitest run"` to `package.json`.
- Use `Effect.Effect<..., ..., ...>` for storage, SoT, and Sync State operations. Do not introduce Promise-returning internals except at TanStack boundary callbacks that already require promises.
- Current public root exports are `createStdSync`, `syncStrategy`, `singleItemSyncStrategy`, and `paceStrategy`. Preserve the `@std-toolkit/tanstack-sync/paced` subpath.

---

## Task: Add Offline Storage Deep Module And IDB Adapter [AFK]

**Why.** Users need to opt into durable local storage without `tanstack-sync` depending on the older entity-aware `@std-toolkit/cache` package. This slice creates the internal grouped KV abstraction and the single public adapter import that later engine slices consume.

**What.** Add `src/offline-storage/` as a deep module with an internal grouped key-value contract, a cloning in-memory adapter, deterministic group naming, storage resolution helpers, and a browser IndexedDB adapter exported only from `@std-toolkit/tanstack-sync/offline-storage/idb`.

**Read first.**

- `CONTEXT.md` — current domain language for SoT, Sync State, Offline Storage, and the instruction to avoid “Cache.”
- `docs/adr/0002-offline-storage-boundary.md` — accepted decisions for grouped KV, `idbStorage`, version reset, package exports, and IndexedDB layout.
- `package.json` — current exports, scripts, dependencies, and the broad `./*` export that this task removes.
- `depcruise.config.ts` — layer rules that need an `offline-storage` layer/module entry.
- `src/util/serialize-partition.ts` — stable partition identity stays here; do not create a second format in storage.
- `../cache/src/idb/internals.ts` — reference only for IndexedDB connection patterns; do not import from `@std-toolkit/cache`.
- `../cache/src/__tests__/setup.ts` — fake IndexedDB setup pattern for Vitest tests.

**Interface produced.**

- Internal barrel `src/offline-storage/index.ts` exports:
  - `type OfflineStorage = { group: (name: string) => OfflineStorageGroup; clear: () => Effect.Effect<void, OfflineStorageError> }`
  - `type OfflineStorageGroup = { get: <T>(key: string) => Effect.Effect<T | null, OfflineStorageError>; getAll: <T>() => Effect.Effect<Array<{ key: string; value: T }>, OfflineStorageError>; put: <T>(key: string, value: T) => Effect.Effect<void, OfflineStorageError>; putMany: <T>(entries: Array<{ key: string; value: T }>) => Effect.Effect<void, OfflineStorageError>; delete: (key: string) => Effect.Effect<void, OfflineStorageError>; clear: () => Effect.Effect<void, OfflineStorageError> }`
  - `type OfflineStorageSetting = OfflineStorage | false`
  - `memoryOfflineStorage(): OfflineStorage`
  - `resolveRootOfflineStorage(setting?: OfflineStorageSetting): OfflineStorage`
  - `resolveCollectionOfflineStorage(args: { inherited: OfflineStorage; override?: OfflineStorageSetting }): OfflineStorage`
  - `offlineStorageGroupName.sourceOfTruth(schemaName: string): string` returning `sot/${schemaName}`
  - `offlineStorageGroupName.syncState(schemaName: string): string` returning `state/${schemaName}`
- Public adapter barrel `src/offline-storage/adapters/idb/index.ts` exports only `idbStorage`.
- Public factory `idbStorage(options: { name: string; version?: number }): OfflineStorage` is importable from `@std-toolkit/tanstack-sync/offline-storage/idb`.
- `package.json` exports exactly `.`, `./paced`, and `./offline-storage/idb`; remove `./*`.
- `package.json` adds runtime dependency `"idb": "8.0.3"`, dev dependencies `"vitest": "4.1.5"` and `"fake-indexeddb": "6.2.5"`, and script `"test": "vitest run"`.

**Inputs from predecessors.** None — can start immediately.

**Out of scope.**

- Do not modify `src/create-std-sync.ts`, `src/partitioned/**`, `src/single-item/**`, `src/source-of-truth/**`, or `src/registry/**`; later tasks wire the engine to this module.
- Do not expose `@std-toolkit/tanstack-sync/offline-storage` as a package subpath.
- Do not import or wrap `@std-toolkit/cache`; the new adapter implements grouped KV directly.

**Acceptance criteria.**

- [ ] `memoryOfflineStorage` clones values on `put`, `putMany`, `get`, and `getAll` using `structuredClone`.
- [ ] `putMany([])` succeeds as a no-op and non-empty `putMany` is all-or-nothing for both memory and IndexedDB.
- [ ] `idbStorage` throws synchronously when `globalThis.indexedDB` is missing, `name` is empty, or `version` is not a positive integer.
- [ ] `idbStorage({ name, version })` defaults `version` to `1`, stores a data version, and clears all persisted group entries when the data version changes.
- [ ] IndexedDB uses one object store for all groups with compound primary key `[group, key]` and a group index for `getAll` and group-level `clear`; it does not create one object store per group.
- [ ] Tests cover memory grouping/cloning/atomic `putMany`, IndexedDB group isolation/getAll/clear, data-version reset, and sync factory validation.
- [ ] `pnpm test`, `pnpm lint`, and `pnpm build` succeed.

**Done when.** `pnpm test` passes with new offline-storage tests and `pnpm lint` succeeds after package exports are tightened.

---

## Task: Wire Keyed Sync To Offline Storage [AFK]

**Why.** Keyed collections are the main SoT and partition Sync State users. This slice makes storage the live backend for convergence and partition state so persisted writes are correct even before the collection mounts.

**What.** Add `offlineStorage` to `createStdSync` and `sync` config, resolve storage at collection config creation, inject storage groups into keyed SoT and Sync State, surface storage failures as `WriteError.Storage`, and change `utils.writeUpsert` from fire-and-forget `void` to `Effect.Effect<void, WriteError>`.

**Read first.**

- `src/create-std-sync.ts` — root factory defaults, `SyncConfig`, option merging, and the call into `buildPartitioned`.
- `src/partitioned/partitioned.ts` — current creation of `makeSourceOfTruth`, `makeSyncStateStore`, mount projection, strategy activation, and `utils.writeUpsert`.
- `src/source-of-truth/source-of-truth.ts` — validation, convergence, tombstone retention, and atomic write behavior currently backed by a `Map`.
- `src/source-of-truth/write-error.ts` — add `Storage` to the existing union without changing strategy signatures.
- `src/partitioned/sync-state.ts` — replace the in-memory `Map` body with a group-backed implementation.
- `src/registry/registry.ts` and `src/registry/tracker.ts` — persisted broadcasts route through `writeServerTruth` while collection projection may be absent.
- `src/offline-storage/index.ts` — Task `Add Offline Storage Deep Module And IDB Adapter` produces the storage contract and group naming helpers.

**Interface produced.**

- Root config: `createStdSync(defaults?: { options?: StdCollectionOptions; offlineStorage?: OfflineStorage | false })`.
- Keyed collection config: `std.sync({ schema, offlineStorage?: OfflineStorage | false, ... })`.
- Storage resolution:
  - root omitted or root `false` creates one memory backend per `createStdSync()` instance;
  - collection omitted inherits the root backend;
  - collection `false` creates a fresh collection-local memory backend;
  - collection storage instance overrides the root backend.
- Keyed SoT group: `offlineStorage.group(offlineStorageGroupName.sourceOfTruth(schema.name))`, i.e. `sot/{schema.name}`.
- Keyed Sync State group: `offlineStorage.group(offlineStorageGroupName.syncState(schema.name))`, i.e. `state/{schema.name}`.
- Keyed Sync State keys: `__total__` for global strategy and the existing serialized partition key from `serializePartition(...)` for partitions.
- `WriteError` includes `{ _tag: 'Storage'; reason: string; cause?: unknown }`.
- `EngineUtils.writeUpsert(entities): Effect.Effect<void, WriteError>`.
- `makeSourceOfTruth<TItem>(args: { schema: AnyEntityESchema; group: OfflineStorageGroup }): SourceOfTruth<TItem>`.
- `makeSyncStateStore<TState = unknown>(args: { group: OfflineStorageGroup }): { get: (key: string) => Effect.Effect<TState | null, WriteError>; set: (key: string, state: TState) => Effect.Effect<void, WriteError> }`.

**Inputs from predecessors.** Task `Add Offline Storage Deep Module And IDB Adapter` produces `src/offline-storage/index.ts` with `OfflineStorage`, `OfflineStorageGroup`, `OfflineStorageSetting`, `memoryOfflineStorage`, `resolveRootOfflineStorage`, `resolveCollectionOfflineStorage`, and `offlineStorageGroupName`.

**Out of scope.**

- Do not edit `src/single-item/**`; Task `Wire Single Item Sync To Offline Storage` owns single-item behavior.
- Do not change strategy public names (`syncStrategy.oldToNew`) or pace strategy behavior.
- Do not add mutation offline queueing or conflict policies; Offline Storage only backs SoT and Sync State.

**Acceptance criteria.**

- [ ] `makeSourceOfTruth.write` validates the whole batch before storage writes, reads current values from the SoT group with `group.get(id)`, converges against stored values, writes accepted entities with one `group.putMany`, retains tombstones, and returns the accepted delta.
- [ ] `makeSourceOfTruth.write` does not project accepted entities when `group.putMany` fails; the failure is `WriteError.Storage`.
- [ ] `makeSourceOfTruth.getAll` reads from the live group with `group.getAll`, filters tombstones, and does not rely on a memory mirror.
- [ ] `makeSyncStateStore.get` and `set` read/write the live state group by key and map storage failures to `WriteError.Storage`.
- [ ] Keyed mount order is `sot.getAll()` -> project persisted live entities -> `callbacks.markReady()` -> start global strategy; if `sot.getAll()` fails, log a clear storage failure and do not call `markReady`.
- [ ] Persisted registry writes while unmounted use storage-backed convergence; projection remains deferred until callbacks exist.
- [ ] `utils.writeUpsert` returns the `Effect` from `writeServerTruth` instead of calling `Effect.runPromise`.
- [ ] Tests cover stale persisted entities being skipped, newer persisted tombstones winning, `writeUpsert` returning a failing `Effect` on storage failure, persisted `state/{schema.name}` values resuming a partition strategy, and collection-level `offlineStorage: false` using collection-local memory rather than root IndexedDB.
- [ ] `pnpm test`, `pnpm lint`, and `pnpm build` succeed.

**Done when.** The keyed storage integration tests pass and `pnpm lint` succeeds with `WriteError.Storage` wired through existing strategy signatures.

---

## Task: Wire Single Item Sync To Offline Storage [AFK]

**Why.** Single-item collections must use the same storage option and persistence semantics as keyed collections, otherwise root-level `offlineStorage` would only partially affect a `createStdSync()` instance.

**What.** Add `offlineStorage` to `singleItemSync` config, resolve it with the same inheritance/override rules as keyed sync, store singleton SoT in `sot/{schema.name}` under `__singleton__`, and store single-item strategy state in `state/{schema.name}` under `__single__`.

**Read first.**

- `src/single-item/single-item.ts` — current `makeSingletonCell`, mount lifecycle, strategy context, projection, and utils.
- `src/single-item/mutations.ts` — update flushing already awaits `writeServerTruth`; preserve that behavior.
- `src/create-std-sync.ts` — `SingleItemSyncConfig` and root storage resolution from Task `Wire Keyed Sync To Offline Storage`.
- `src/source-of-truth/convergence.ts` — singleton SoT uses the same update-key convergence rule as keyed SoT.
- `src/collection-projection/collection-projection.ts` — single-item projection still writes entity-to-item rows through the same projector.
- `src/offline-storage/index.ts` — storage groups, memory backend, and naming helpers.
- `src/partitioned/sync-state.ts` — reuse the group-backed Sync State store produced by Task `Wire Keyed Sync To Offline Storage`.

**Interface produced.**

- Single-item collection config: `std.singleItemSync({ schema, offlineStorage?: OfflineStorage | false, ... })`.
- Single-item SoT group/key: group `sot/{schema.name}`, key `__singleton__`.
- Single-item Sync State group/key: group `state/{schema.name}`, key `__single__`.
- Single-item strategy context uses `getState: stateStore.get('__single__')` and `setState: (state) => stateStore.set('__single__', state)`.
- `writeServerTruth` for single-item collections remains `Effect.Effect<void, WriteError>`.

**Inputs from predecessors.**

- Task `Add Offline Storage Deep Module And IDB Adapter` produces `src/offline-storage/index.ts`.
- Task `Wire Keyed Sync To Offline Storage` produces root/collection storage resolution in `src/create-std-sync.ts`, `WriteError.Storage`, and group-backed `makeSyncStateStore({ group })`.

**Out of scope.**

- Do not edit `src/partitioned/**` keyed behavior; this task only adapts single-item sync.
- Do not change `singleItemSyncStrategy.getOnce` behavior.
- Do not add public single-item write utilities beyond the utilities already present.

**Acceptance criteria.**

- [ ] `singleItemSync` accepts `offlineStorage` with the same omitted/inherit, `false`/collection-local memory, and storage-instance override semantics as keyed `sync`.
- [ ] Single-item SoT reads the current singleton from `group.get('__singleton__')` during writes, converges with `converge`, writes accepted entities with `group.put('__singleton__', entity)`, and maps storage failures to `WriteError.Storage`.
- [ ] Single-item mount order is `current singleton read` -> project persisted singleton -> `callbacks.markReady()` -> start strategy; if the storage read fails, log a clear storage failure and do not call `markReady`.
- [ ] Single-item strategy state persists through `state/{schema.name}` key `__single__`.
- [ ] Tests cover IndexedDB-backed singleton persistence across recreated `createStdSync` instances with the same `idbStorage({ name, version })`, single-item `offlineStorage: false` avoiding root IndexedDB, and storage failure preventing `markReady`.
- [ ] `pnpm test`, `pnpm lint`, and `pnpm build` succeed.

**Done when.** Single-item storage tests pass and both keyed and single-item configs typecheck with `offlineStorage`.

---

## Task: Refresh Docs And Public Examples [AFK]

**Why.** The current docs still mention the removed cache model and old API names, which would send users toward `@std-toolkit/cache`, `totalSync`, `onDemand`, and `queueUpdate` instead of the accepted Offline Storage contract.

**What.** Update user-facing and maintainer docs to describe `offlineStorage`, `idbStorage`, current sync API names, storage grouping, and the new `writeUpsert` Effect return without exposing the internal storage root subpath.

**Read first.**

- `README.md` — currently stale; still references `@std-toolkit/cache/idb`, `totalSync`, `onDemand`, `singleItem`, `fetchMore`, and old cache behavior.
- `story.md` — developer narrative for `createStdSync`, collection utilities, storage story, and lifecycle ordering.
- `implementation.md` — concrete build plan; currently says `@std-toolkit/cache` is dropped and persistence is future work.
- `CONTEXT.md` — glossary already has Offline Storage but still contains lines saying SoT and Sync State are in-memory only for now.
- `docs/adr/0002-offline-storage-boundary.md` — accepted storage boundary and IDB layout decisions.
- `package.json` — final public exports are `.`, `./paced`, and `./offline-storage/idb`.

**Interface produced.**

- README import example:
  - `import { createStdSync, syncStrategy, singleItemSyncStrategy, paceStrategy } from '@std-toolkit/tanstack-sync';`
  - `import { idbStorage } from '@std-toolkit/tanstack-sync/offline-storage/idb';`
- README root config example:
  - `const std = createStdSync({ offlineStorage: idbStorage({ name: 'app-sync', version: 1 }) });`
- README collection override examples:
  - inherited root storage by omitting `offlineStorage`;
  - collection-local memory with `offlineStorage: false`.
- Docs state `utils.writeUpsert(entityOrEntities)` returns `Effect.Effect<void, WriteError>`.
- Docs state the only public storage subpath is `@std-toolkit/tanstack-sync/offline-storage/idb`.

**Inputs from predecessors.**

- Task `Add Offline Storage Deep Module And IDB Adapter` produces `idbStorage` and package export `./offline-storage/idb`.
- Task `Wire Keyed Sync To Offline Storage` produces keyed `offlineStorage` config and `writeUpsert` returning `Effect`.
- Task `Wire Single Item Sync To Offline Storage` produces single-item `offlineStorage` config.

**Out of scope.**

- Do not modify implementation code in this task except import/example snippets inside docs.
- Do not document internal `OfflineStorage`, `OfflineStorageGroup`, `memoryOfflineStorage`, or `resolveCollectionOfflineStorage` as public APIs.
- Do not revive `@std-toolkit/cache`, `totalSync`, `onDemand`, `fetchMore`, or `queueUpdate` in examples.

**Acceptance criteria.**

- [ ] `README.md` shows the current public API names: `sync`, `singleItemSync`, `syncStrategy`, `singleItemSyncStrategy`, `paceStrategy`, `pacedUpdate`, `writeUpsert`, and `idbStorage`.
- [ ] `story.md` storage section says SoT and Sync State can be backed by Offline Storage and that storage is the live backend, not a hydration-only cache.
- [ ] `implementation.md` includes the `src/offline-storage/` deep module tree, explicit package exports, storage resolution semantics, group names `sot/{schema.name}` and `state/{schema.name}`, singleton keys `__singleton__` and `__single__`, and `WriteError.Storage`.
- [ ] `CONTEXT.md` no longer says SoT or Sync State are in-memory only for now; it keeps glossary-level language and does not become an implementation spec.
- [ ] `docs/adr/0002-offline-storage-boundary.md` remains consistent with the implemented adapter path `./offline-storage/idb` and factory `idbStorage`.
- [ ] `pnpm lint` and `pnpm build` succeed.

**Done when.** Documentation no longer contains stale `@std-toolkit/cache`, `totalSync`, `onDemand`, `fetchMore`, or `queueUpdate` examples, and `pnpm lint` succeeds.
