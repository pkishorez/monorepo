---
'auth-toolkit': patch
---

Fix fresh D1 database deployments with Alchemy 2.0.0-beta.76 by upgrading Drizzle ORM and Kit to v1 RC and shipping one timestamped migration layout shared with in-memory SQLite. Use Better Auth's official Relations v2 adapter and schema generator, preserving the existing database helper APIs.
