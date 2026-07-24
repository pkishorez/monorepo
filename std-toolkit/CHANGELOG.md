# std-toolkit

## Unreleased

### Breaking Changes

- Removed the `eschema` package binary and the wildcard-importable `std-toolkit/eschema/cli` path. Semantic snapshots are now available through `std-toolkit/snapshot`, with `std-toolkit snapshot` providing single-file baseline verification and approval.
- `ESchema.make` and `ValueESchema.make` now require a name as the first argument: `ESchema.make({ ... })` becomes `ESchema.make('Name', { ... })`, and `ValueESchema.make(schema)` becomes `ValueESchema.make('Name', schema)`. The name is the schema's snapshot identity, must be non-empty (enforced at type level and runtime), and must be unique across composed schemas.
- `toSchema` no longer accepts a `ToSchemaOptions` second argument; the identifier is always derived from the schema's own name. Replace `toSchema(schema, { name: 'X' })` with `toSchema(schema)` and set the name in `make`.
- Optional fields are now rejected at the type level. `Schema.optional`, `Schema.optionalKey`, and any field whose type admits `undefined` (e.g. `Schema.UndefinedOr`) no longer compile in `make` or `evolve`; model absence as `null` via `Schema.NullOr(...)`.
- DynamoDB secondary indexes are now classified by how they are declared: `.gsi(...)` always produces a GlobalSecondaryIndex, even when its partition key matches the table's primary partition key (previously such an index was silently emitted as a LocalSecondaryIndex). Use `.lsi(...)` where a local index is intended; re-provisioned environments and table snapshots reflect the declared kind.

## 0.0.2

### Patch Changes

- [`6d15b71`](https://github.com/pkishorez/monorepo/commit/6d15b71455a81ce4bd542f6d288eb9dfa4d04d71) Thanks [@pkishorez](https://github.com/pkishorez)! - DynamoDB toolkit cleanups:

  - Removed from the public surface: `DynamoEntity`, `DynamoSingleEntity`, `SQLiteEntity`, `SQLiteSingleEntity`, and `EntityRegistry` value exports (the `EntityType` / `SingleEntityType` types remain). Use `DynamoTable` / `SQLiteTable` and the entity APIs built on them instead.
  - `./idb` subpath now resolves to the restructured `dist/db/idb/src/` layout; deep `./idb/*` import paths changed accordingly.
  - Peer ranges: `effect` loosened to `^4.0.0-beta.78`, `react` widened to `^18 || ^19`, `@tanstack/react-db` stays `>=0.1.64`.

## 0.0.1

### Patch Changes

- [#11](https://github.com/pkishorez/monorepo/pull/11) [`d638e05`](https://github.com/pkishorez/monorepo/commit/d638e05860efdff76d23a9ddf0bc677c9af3e94f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Initial public release. Single-table design toolkit: database-agnostic sync over single-table item collections, with schema evolution (eschema), DynamoDB and SQLite adapters, and TanStack DB integration. Adapters reorganized under src/db/\*, exposed via the ./dynamodb and ./sqlite entrypoints.
