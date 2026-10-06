---
'@kstackz/std-toolkit': patch
---

std-toolkit runs in Expo apps. `@kstackz/std-toolkit/db/sqlite/expo` adds `makeExpoSQLite`, a SQLite driver over a database opened with expo-sqlite, so a StdTable can live on the phone. `@kstackz/std-toolkit/sync/platform/expo` adds the `expo({ database })` Platform, which keeps each Std Sync in its own table of that database with no Leadership or Doorbell, plus `listStdSyncs(database)` and `deleteStdSync(database, name)` to find and drop those local copies. Neither entry point imports expo-sqlite, so std-toolkit gains no dependency.
