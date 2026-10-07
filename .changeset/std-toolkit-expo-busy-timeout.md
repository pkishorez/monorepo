---
'@kstackz/std-toolkit': patch
---

The Expo SQLite driver's guarded writes wait up to 5 s for another connection's write lock (`PRAGMA busy_timeout` on expo-sqlite's second, exclusive connection) instead of failing with "database is locked". Set the same pragma on the database you hand it.
