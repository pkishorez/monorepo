---
'@kestack/ai-toolkit': patch
---

`@kestack/ai-toolkit/machines/backend` is the Machines Backend: `serve({ auth, site, database })` answers `MachinesApi` on a Worker's D1 binding, over the new `machines` std Table (`machinesTable`). `Report` records a Machine and its Last Seen, and refuses an id another User reported (`MachineTaken`); `List` gives the caller's Machines; `Forget` keeps a tombstone, after which a Report from that id, or from the Sign-in it last reported with, is refused `MachineForgotten`. `GET /auth` answers how a Machine signs in, and only the app's origin may call `/rpc` with credentials. `serveOver` runs it over any std-toolkit SQLite driver. A call to `/rpc` from any other origin is refused 403 before it is read; one with no `Origin`, as `serve` makes, goes ahead. A `MachineReport` is bounded: `url` is null or `https://…` (at most 256 characters), `id` and `name` at most 64, `key` at most 128, `version` at most 32.
