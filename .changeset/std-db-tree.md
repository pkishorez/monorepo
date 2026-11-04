---
'@kestack/std-toolkit': patch
'@kestack/connect': patch
---

`Broadcaster`, `defaultBroadcaster`, `sharedBroadcaster` and `ChangeNotice` move from `@kestack/std-toolkit/core` to `@kestack/std-toolkit/db`: only a table's writes announce Change Notices. Inside, `db` reads as three parts: `table` declares a table, `setup` opens it safely, and `adapters` hold DynamoDB, SQLite, IndexedDB and Memory. The Vitest snapshot-file check lives with the table test in `db/testing`.
