# std-toolkit

Database-agnostic sync utilities — schema evolution, DynamoDB/SQLite adapters, TanStack DB integration.

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

| Subpath                                                    | Description                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`std-toolkit/core`](src/core/README.md)                   | Shared primitives: `EntitySchema`, `MetaSchema`, `Broadcaster`, `StdToolkitError`    |
| [`std-toolkit/eschema`](src/eschema/README.md)             | Versioned, self-migrating schemas built on Effect Schema; includes the `eschema` CLI |
| [`std-toolkit/dynamodb`](src/dynamodb/README.md)           | DynamoDB table/entity services, expression builders, marshall utilities              |
| [`std-toolkit/sqlite`](src/sqlite/README.md)               | SQLite table/entity services with runtime adapters for multiple environments         |
| [`std-toolkit/tanstack-sync`](src/tanstack-sync/README.md) | TanStack DB sync engine with paced writes and IndexedDB offline storage              |

## Bin

```sh
npx eschema          # schema evolution CLI (see std-toolkit/eschema)
```

## Requirements

Node ≥ 24
