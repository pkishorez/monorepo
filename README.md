# Monorepo

My all open source contributions in one place.

**Note**: Everything is in full flux. Expect no stable changes anytime soon.

## Structure

```
monorepo/
├── std-toolkit/
│   ├── dynamodb-client/
│   ├── db-dynamodb/
│   ├── db-idb/
│   ├── db-sqlite/
│   ├── eschema/
│   ├── std-db-collection/
│   └── demo-app/
└── packages/
    ├── use-effect-ts/
    └── item-collection/
```

## std-toolkit

Single Table Design (STD) packages designed to work together.

- **dynamodb-client** - Type-safe DynamoDB client
- **db-dynamodb** - STD implementation for DynamoDB
- **db-idb** - STD implementation for IndexedDB
- **db-sqlite** - STD implementation for SQLite (WIP)
- **eschema** - Schema evolution system
- **std-db-collection** - TanStack DB implementation for STD
- **demo-app** - Demo application

## packages

Adhoc packages.

- **use-effect-ts** - React hooks for Effect.TS
- **item-collection** - Item collection utilities (My initial attempt to tanstack db. Deprecated in favour of std-toolkit)
