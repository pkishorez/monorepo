---
status: superseded by ADR-0004
---

# Local runtimes are database-scoped

SQLite and IndexedDB runtimes represent one database or file. Each adapter configuration binds a portable `Table` to its physical table or object-store name. Multiple Table definitions can therefore use one database-scoped runtime directly. Setup remains idempotent, and concurrent setup calls for different Tables must converge without a database-level registry. Local adapters do not copy DynamoDB's physical routing: local Tables share one database connection, so equivalent binding machinery would add configuration without solving a local storage concern.
