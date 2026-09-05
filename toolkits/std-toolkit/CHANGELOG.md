# std-toolkit

## 0.0.9

### Patch Changes

- [`20c7f35`](https://github.com/pkishorez/monorepo/commit/20c7f357eb10771f0fb56d6767c14f6ca63a9a4f) Thanks [@pkishorez](https://github.com/pkishorez)! - Add `std-toolkit/db/dynamodb/alchemy`: an Alchemy deployment helper that provisions the DynamoDB table your app already talks to, so runtime and infrastructure cannot drift apart.

  - `makeDynamoDBTable(topology, { resourceId, tableName })` turns the topology returned by `DynamoDB.getTableDefinition` into an Alchemy `DynamoDB.Table` resource, mapping attribute definitions, partition and sort keys, billing mode, and both local and global secondary indexes.
  - Alchemy is an optional peer dependency imported only by this entry point, so the ordinary `std-toolkit/db/dynamodb` entry point stays free of infrastructure dependencies.

  Adopts the DynamoDB table resource previously housed in `alchemy-toolkit`; consumers must update their imports to the new entry point.

- Updated dependencies []:
  - @pkishorez/effect-tracer@0.0.9

## 0.0.8

### Patch Changes

- [#29](https://github.com/pkishorez/monorepo/pull/29) [`efb3901`](https://github.com/pkishorez/monorepo/commit/efb3901439a0359ed37108db73447a07ddc2a73d) Thanks [@pkishorez](https://github.com/pkishorez)! - Add reversible draft schema versions that remain invisible to persisted snapshots, add optimistic table-level snapshot enforcement backed by an in-table baseline, and rename snapshot approval commands and output to use clearer update terminology.

- [`06eb95d`](https://github.com/pkishorez/monorepo/commit/06eb95dad79a315549e540a1aacd268c334ee8ef) Thanks [@pkishorez](https://github.com/pkishorez)! - Add durable offline sync mutations via an outbox-based mutation flow, and reorganize the sync worker layer into a flow module with a shared outbox-transaction plan.

- [#29](https://github.com/pkishorez/monorepo/pull/29) [`ac3a33c`](https://github.com/pkishorez/monorepo/commit/ac3a33c4502e098fde58c9ae64923d7ddbbeb787) Thanks [@pkishorez](https://github.com/pkishorez)! - Add `version` to `createStdSync`. When the stored version differs from the configured one (including clients that never had one), the Sync Store is emptied before anything is served, so a wiped or re-shaped backend never meets a stale local replica.
- Updated dependencies [[`b0730f3`](https://github.com/pkishorez/monorepo/commit/b0730f371943d2f45b144103302cc64563f25ff7)]:
  - @pkishorez/effect-tracer@0.0.8

## 0.0.7

### Patch Changes

- [`eacf385`](https://github.com/pkishorez/monorepo/commit/eacf385ccd0458933758ae6a18ff078f4d669325) Thanks [@pkishorez](https://github.com/pkishorez)! - Add `getAndCheckOp` for guarding transactions with keyed-entity business checks.

- [`4da25e4`](https://github.com/pkishorez/monorepo/commit/4da25e426d32fb482406c089ba7c213d1d1bba98) Thanks [@pkishorez](https://github.com/pkishorez)! - Report snapshot contract changes as semantic edits, including object index signature changes, and keep snapshot approval in the CLI.

- [`6630802`](https://github.com/pkishorez/monorepo/commit/66308024a71ab6a30aa0e1f979527c8fa23f533c) Thanks [@pkishorez](https://github.com/pkishorez)! - Expose the latest decoded entity form at every application boundary, and keep encoded values — the ones stamped with `_v` — inside persistence and transport. `EntitySchema` becomes the single complete-entity codec between `EncodedEntity` and `DecodedEntity`: encoding always writes the latest version, decoding accepts and migrates every known version. See ADR 0005.

  Also in this release:

  - New `Encoded & decoded values` story group covering codec fields end to end at the StdTable level: what you hand a write versus what the row holds, where `_v` lives, that index keys derive from the encoded side, and how a codec field survives an update — verified across DynamoDB, IndexedDB, memory, and SQLite.
  - `applyToSyncReplica` validates entity shape again before touching `meta._e`. A mutation handler or `SyncSource.fetch` that returns a malformed entity now fails with `Invalid` instead of killing the sync fiber with a `TypeError`.
  - The Sync Replica no longer round-trips accepted entities through encode/decode, and the one decode it still needs — repairing a settle receipt from a stored row — runs after the transaction commits rather than before it, so a stored row this build cannot decode no longer fails the whole batch.

  ## Breaking changes

  This is a deliberate breaking replacement rather than a compatibility layer, because wrappers would preserve exactly the encoded/decoded distinction application code should no longer have to manage. The package is pre-1.0, so it ships as a patch.

  - **Persisted Sync Stores must be cleared.** The stored replica record changed from `{ value, meta }` to a single `entity` field with no schema evolution, so existing IndexedDB and SQLite sync stores cannot be read by this version. Clear site data, or drop and recreate the sync store table, as part of the upgrade.
  - **`_v` is gone from Entity Meta.** It lives on the encoded value only. Code reading `entity.meta._v` breaks, and decoded meta that still carries `_v` is now actively rejected.
  - **`core` renames.** `EntityType` → `DecodedEntity`, `SingleEntityType` → `DecodedSingleEntity`, `MetaSchema` → `EntityMetaSchema`. `EncodedEntity`, `EncodedSingleEntity`, `EntityMeta`, and `SingleEntityMeta` are new. `EntitySchema` and `SingleEntitySchema` are no longer plain `Schema.Struct`s — they are codecs exposing `decode`, `encode`, and `latestVersion`.
  - **Sync callbacks changed shape.** `onInsert`, `onUpdate`, `onDelete`, and `SyncSource` fetches take and return `DecodedEntity` / `DecodedSingleEntity`. Returned values are now encoded through the entity schema, so a value that does not match the schema fails with `Invalid` where it previously passed through.
  - **Collections now validate.** Keyed and single-item collections carry a Standard Schema, so an insert or update whose item does not match the latest decoded shape is rejected at the mutation instead of reaching the replica.
  - **Peer Sync wire format changed.** Peer messages carry encoded entities whose value holds `_v` and whose meta does not. Tabs running the previous version cannot exchange messages with tabs running this one.
  - **`isEntity` is now `isDecodedEntity`**, and it also rejects meta containing `_v`.

- [`211dbe7`](https://github.com/pkishorez/monorepo/commit/211dbe7a900199a9471120fb9e2b03c32c8c43d7) Thanks [@pkishorez](https://github.com/pkishorez)! - `createStdSync` takes one `platform` option instead of `storeLayer`, `leadershipLayer`, and `peerSync`.

  A platform names the environment a Std Sync instance runs in — where the Sync Store lives and how concurrent participants coordinate. `platform: browser()` (from `std-toolkit/sync/platform/browser`) is the shipped preset: an IndexedDB Sync Store in database `std-sync` (overridable via `databaseName`), Web Locks Leadership, and Peer Sync over BroadcastChannel. A platform is a plain value and may be shared between instances — everything it provides is consumed per qualified Collection Name. Omitting `platform` means a solo participant: an isolated Memory Sync Store, no Leadership, no Peer Sync.

  Breaking changes:

  - `storeLayer`, `leadershipLayer`, and `peerSync` are removed from `StdSyncDefaults`. Pass a `platform` value `{ storeLayer?, leadershipLayer?, peerSync? }` for custom wiring.
  - Peer Sync is now opt-in and the core ships no default transport. It was previously on by default whenever `BroadcastChannel` existed, which let participants that do not share a Backend inject entities into each other's replicas. A platform enables it with `peerSync: { channel }`; the BroadcastChannel factory is exported as `broadcastChannel` from `std-toolkit/sync/platform/browser`.
  - Web Locks Leadership moved into the browser platform module; the `std-toolkit/sync/leadership/web-locks` subpath export is removed. Import `browser()` instead, or reach the raw pieces via `std-toolkit/sync/platform/browser`.

- [`8215ec7`](https://github.com/pkishorez/monorepo/commit/8215ec7fea498d366f9b06d9f947db960d5bf90c) Thanks [@pkishorez](https://github.com/pkishorez)! - Process every insert, update, and delete in batched collection mutations, with backend work limited to five concurrent operations.

- [`2cfe607`](https://github.com/pkishorez/monorepo/commit/2cfe6076fe401aec0fa5f3b8e3d9f5ed655228a7) Thanks [@pkishorez](https://github.com/pkishorez)! - Transact ops now carry intent only; `transact` performs the reads at commit time.

  `getAndUpdateOp`, `deleteOp`, `restoreOp`, and `getAndCheckOp` no longer read when you build them, so the interval between building an op and committing it cannot make it stale. `transact` reads the current items consistently and concurrently, applies each op to what it read, and submits.

  Breaking changes:

  - An update callback can no longer return `null`. A rule that declines the write is an entity invariant, passed as the `check` option beside `lastWriteWins` and evaluated against the value `transact` reads. `UpdateRefused` is removed; a refusal is `CheckRefused`.
  - `TransactOutcome.status` replaces `failed` with `stale`, `refused`, and `missing`, so a caller can tell a retryable conflict from a broken invariant or a wrong key.
  - `NoItemToUpdate`, `NoItemToCheck`, and `ItemAlreadyExists` now surface from `transact` rather than from the op constructor.
  - `check` and `lastWriteWins` are mutually exclusive; the types reject the pair, because only the `_u` condition holds the value the invariant judged.
  - `StdTableContract.getItem` takes an optional `{ consistent }`.

- Updated dependencies [[`9bf3b20`](https://github.com/pkishorez/monorepo/commit/9bf3b201e4bf1817b579f86d3840f7b146a65126)]:
  - @pkishorez/effect-tracer@0.0.7

## 0.0.6

### Patch Changes

- [`66f7e10`](https://github.com/pkishorez/monorepo/commit/66f7e10cc241c31e3d204f237a8ba05fab1a060d) Thanks [@pkishorez](https://github.com/pkishorez)! - Release the synchronized toolchain against `effect@4.0.0-rc.110` with matching internal package versions.
- Updated dependencies [[`66f7e10`](https://github.com/pkishorez/monorepo/commit/66f7e10cc241c31e3d204f237a8ba05fab1a060d)]:
  - @pkishorez/effect-tracer@0.0.6

## 0.0.5

### Patch Changes

- [`9786df7`](https://github.com/pkishorez/monorepo/commit/9786df77466cd3ca71f256a374c74ff0fb866e52) Thanks [@pkishorez](https://github.com/pkishorez)! - Pin `@effect/platform-node-shared` as a direct exact dependency. `@effect/platform-node@4.0.0-beta.102` depends on it via a caret range, so npm consumers resolved the `4.0.0-rc.*` build, whose `effect` peer nested `effect@4.0.0-rc.*` next to the beta platform-node and crashed imports (`ERR_MODULE_NOT_FOUND` on `effect/dist/unstable/http/Multipasta/Node.js`). The direct pin keeps the whole tree on `4.0.0-beta.102`.

## 0.0.4

### Patch Changes

- [`3e4f58d`](https://github.com/pkishorez/monorepo/commit/3e4f58d500e3060b5a027f2a370e6ff0de233a5e) Thanks [@pkishorez](https://github.com/pkishorez)! - Pin the `effect` peer dependency (and other registry peers) to exact versions. The previous `^4.0.0-beta.102` range also matched `4.0.0-rc.*` prereleases, so fresh installs (e.g. `npx laymos`) resolved an incompatible `effect` build and crashed with `ERR_MODULE_NOT_FOUND`.

- Updated dependencies [[`3e4f58d`](https://github.com/pkishorez/monorepo/commit/3e4f58d500e3060b5a027f2a370e6ff0de233a5e)]:
  - @pkishorez/effect-tracer@0.0.2

## 0.0.3

### Patch Changes

- [#22](https://github.com/pkishorez/monorepo/pull/22) [`8c24af2`](https://github.com/pkishorez/monorepo/commit/8c24af227c83ab532ff0865cbff44a9b5db3d34e) Thanks [@pkishorez](https://github.com/pkishorez)! - This release replaces the database and sync APIs wholesale.

  **One table definition, any adapter.** Describe a table once with `StdTable` and
  hand it to whichever adapter you're running on:

  ```ts
  const users = StdTable.make('users')
    .primary('pk', 'sk')
    .gsi('byEmail', 'email')
    .build();

  const { layer, setup } = DynamoDB.make(users, config);
  ```

  `.entity(schema)` and `.singleEntity(schema)` bind entities to the table. Every
  adapter takes the same shape — `DynamoDB.make`, `SQLite.make`, `IDB.make`, and
  `Memory.make` — and returns `{ layer, setup }`, so moving a table between
  DynamoDB, SQLite, IndexedDB, and the new dependency-free in-memory adapter is a
  one-line change.

  Adapters live under `std-toolkit/db`: `db/dynamodb`, `db/sqlite`, `db/idb`,
  `db/memory`, with SQLite drivers at `db/sqlite/{node,bun,better-sqlite3,durable-object}`.

  **One error type.** Everything fails with `DatabaseError` carrying a tagged
  `reason` — `ItemAlreadyExists`, `NoItemToUpdate`, `ConditionFailed`,
  `TransactFailed`, `DecodeFailed`, and so on. Match on `error.reason._tag`
  instead of learning each adapter's error classes.

  **Transactions assert as well as write.** Alongside the write ops, `transact`
  takes checks that assert without writing — `unchangedOp`, `existsOp`, and
  `notExistsOp`. Checks share the ops array and the 100-item limit, and yield
  `null` at their position so results line up one-to-one with the ops you passed.
  A failed transaction reports a `TransactOutcome` per op, so you can see which
  one refused and why.

  **Schemas carry their own name.** `ESchema.make('User', { ... })` — the name is
  the schema's snapshot identity, must be non-empty, and must be unique across
  composed schemas. `toSchema(schema)` derives its identifier from that name.
  Snapshots move to `std-toolkit/snapshot`, kept as a single-file baseline and
  driven by three commands: `std-toolkit snapshot verify` reports only what
  drifted and exits 1, `snapshot approve` writes the baseline, and `snapshot view`
  prints the contract in full. The CLI runs on Effect's command runtime, so
  `--help`, `--version`, shell completions, and a `--cwd` flag come with it.
  Optional fields are rejected at the type level; model absence as `null` with
  `Schema.NullOr`. DynamoDB indexes are classified by how you declare them —
  `.gsi(...)` is always global, `.lsi(...)` always local.

  **Sync persists to any table and converges across tabs.** Pass any
  `StdTable`-backed layer as `createStdSync({ persistenceLayer })`, built from the
  exported `syncPersistenceTable`; omit it and sync stays in memory. Tabs sharing
  local persistence now stay in step — durable projection positions plus a
  `BroadcastChannel` notice let every tab project a confirmed write without
  re-fetching it. Configure with `notices: { scope, channel }`; supply your own
  transport with `ChannelFactory` outside the browser, and environments without
  `BroadcastChannel` simply run without notices.

  `createStdSync` takes `runtime`, `onEvent`, `flow`, `cadence`,
  `persistenceLayer`, and `notices`, and the instance exposes `dispose()`.
  Collections default `gcTime` to 10 seconds, because TanStack DB's five-minute
  default arms a ref'd timer that keeps a Node process alive.

  Fixes: `pacedUpdate` wrote against the row captured on the first call for a key
  rather than the current one, and queued change notices could be dropped when a
  persistence runtime was disposed mid-flight.

  Requires `effect@^4.0.0-beta.102`.

- Updated dependencies [[`4be44ed`](https://github.com/pkishorez/monorepo/commit/4be44ed7294438f8c08bd00124b8e134b91971a6)]:
  - @pkishorez/effect-tracer@0.0.1

## 0.0.2

### Patch Changes

- [`6d15b71`](https://github.com/pkishorez/monorepo/commit/6d15b71455a81ce4bd542f6d288eb9dfa4d04d71) Thanks [@pkishorez](https://github.com/pkishorez)! - DynamoDB toolkit cleanups:

  - Removed from the public surface: `DynamoEntity`, `DynamoSingleEntity`, `SQLiteEntity`, `SQLiteSingleEntity`, and `EntityRegistry` value exports (the `EntityType` / `SingleEntityType` types remain). Use `DynamoTable` / `SQLiteTable` and the entity APIs built on them instead.
  - `./idb` subpath now resolves to the restructured `dist/db/idb/src/` layout; deep `./idb/*` import paths changed accordingly.
  - Peer ranges: `effect` loosened to `^4.0.0-beta.78`, `react` widened to `^18 || ^19`, `@tanstack/react-db` stays `>=0.1.64`.

## 0.0.1

### Patch Changes

- [#11](https://github.com/pkishorez/monorepo/pull/11) [`d638e05`](https://github.com/pkishorez/monorepo/commit/d638e05860efdff76d23a9ddf0bc677c9af3e94f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Initial public release. Single-table design toolkit: database-agnostic sync over single-table item collections, with schema evolution (eschema), DynamoDB and SQLite adapters, and TanStack DB integration. Adapters reorganized under src/db/\*, exposed via the ./dynamodb and ./sqlite entrypoints.
