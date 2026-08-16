# std-toolkit

## 0.0.2

### Patch Changes

- [`6d15b71`](https://github.com/pkishorez/monorepo/commit/6d15b71455a81ce4bd542f6d288eb9dfa4d04d71) Thanks [@pkishorez](https://github.com/pkishorez)! - DynamoDB toolkit cleanups:

  - Removed from the public surface: `DynamoEntity`, `DynamoSingleEntity`, `SQLiteEntity`, `SQLiteSingleEntity`, and `EntityRegistry` value exports (the `EntityType` / `SingleEntityType` types remain). Use `DynamoTable` / `SQLiteTable` and the entity APIs built on them instead.
  - `./idb` subpath now resolves to the restructured `dist/db/idb/src/` layout; deep `./idb/*` import paths changed accordingly.
  - Peer ranges: `effect` loosened to `^4.0.0-beta.78`, `react` widened to `^18 || ^19`, `@tanstack/react-db` stays `>=0.1.64`.

## 0.0.1

### Patch Changes

- [#11](https://github.com/pkishorez/monorepo/pull/11) [`d638e05`](https://github.com/pkishorez/monorepo/commit/d638e05860efdff76d23a9ddf0bc677c9af3e94f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Initial public release. Single-table design toolkit: database-agnostic sync over single-table item collections, with schema evolution (eschema), DynamoDB and SQLite adapters, and TanStack DB integration. Adapters reorganized under src/db/\*, exposed via the ./dynamodb and ./sqlite entrypoints.
