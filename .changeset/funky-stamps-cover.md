---
'std-toolkit': patch
---

Initial public release. Single-table design toolkit: database-agnostic sync over single-table item collections, with schema evolution (eschema), DynamoDB and SQLite adapters, and TanStack DB integration. Adapters reorganized under src/db/\*, exposed via the ./dynamodb and ./sqlite entrypoints.
