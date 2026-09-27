---
'@kstackz/lotel': patch
---

Initial release under the `@kstackz` scope.

Receives OpenTelemetry spans and logs over OTLP, stores them in SQLite, and serves them back over RPC. It is a library, not a server; DevTools hosts it. You need it to keep local telemetry somewhere a UI can read and sync.
