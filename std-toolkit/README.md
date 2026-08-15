# std-toolkit

Single-table design toolkit — database-agnostic sync over single-table item collections, with schema evolution, portable database adapters, and TanStack DB integration.

## Install

```sh
npm install std-toolkit
```

Peer dependencies (install what you use):

```sh
npm install effect                     # required by all subpaths
npm install @tanstack/react-db react   # required by tanstack-sync
```

## Subpaths

| Subpath                                                                     | Description                                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`std-toolkit/core`](src/core/README.md)                                    | Shared primitives: `EntitySchema`, `MetaSchema`, `Broadcaster`, `StdToolkitError` |
| [`std-toolkit/eschema`](src/eschema/README.md)                              | Versioned, self-migrating schemas built on Effect Schema                          |
| [`std-toolkit/snapshot`](src/eschema/README.md#semantic-contract-snapshots) | Semantic contract decoding, inspection, comparison, and rendering                 |
| `std-toolkit/db`                                                            | Portable Table and Entity definitions and operations                              |
| [`std-toolkit/db/dynamodb`](src/db/dynamodb/README.md)                      | DynamoDB binding, setup, expression builder, and native operations                |
| [`std-toolkit/db/sqlite`](src/db/sqlite/README.md)                          | SQLite binding and setup with separate environment driver entrypoints             |
| [`std-toolkit/db/idb`](src/db/idb/README.md)                                | IndexedDB binding and explicit Store setup                                        |
| [`std-toolkit/db/memory`](src/db/memory/README.md)                          | Dependency-free, ephemeral Memory adapter for any JavaScript runtime              |
| [`std-toolkit/tanstack-sync`](src/tanstack-sync/README.md)                  | TanStack DB sync engine with paced writes and IndexedDB offline storage           |

## Requirements

Node ≥ 24

## Contract snapshots

Default-export a schema or table snapshot from `std-toolkit.snapshot.ts`, then
approve and verify the committed `std-toolkit.snapshot.json` baseline:

```sh
std-toolkit snapshot -u
std-toolkit snapshot
```

The verification command exits with status 1 when the declared storage
contract drifts, making the same command suitable for GitHub Actions.
