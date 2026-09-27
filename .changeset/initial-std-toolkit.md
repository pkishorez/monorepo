---
'@kstackz/std-toolkit': patch
---

Initial release under the `@kstackz` scope.

Store many entity types in one table and keep a browser copy in sync. It gives you versioned schemas that still read old rows, one table definition that runs on DynamoDB, SQLite, IndexedDB, or memory without code changes, and a sync engine that keeps TanStack DB collections fresh. You need it so every app does not hand-write its own schema migrations, storage layer, and sync loop.
