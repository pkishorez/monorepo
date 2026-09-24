---
'std-toolkit': patch
---

Add a Cloudflare D1 SQLite driver with caller-owned bindings, StdTable setup and layers, and atomic conditional transactions.

Breaking:

- The sync flow contract moves to `@pkishorez/flow`: `FlowLane` is now a Flow `Participant`, `log` becomes `event`, `level` becomes `severity`, `participantName` / `id` become `name` / `flowId`, message and activation names must be strings, and `activated` takes the name directly.
- Requires `effect@4.0.0-rc.112` instead of `4.0.0-rc.110`, and `alchemy@2.0.0-beta.76` instead of `2.0.0-beta.72`.
