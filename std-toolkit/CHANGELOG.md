# std-toolkit

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
