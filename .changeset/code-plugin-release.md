---
'code': patch
'@kestack/connect': patch
---

Code calls a Connection's code Plugin at the Release it was built with, and tells a Connection Updating from a Code that is Stale (ADR 0006).

- Code is built with the latest Release in the code Plugin's Release Log as `import.meta.env.PLUGIN_CODE`, and its build fails without one; under `pnpm dev`, with the sha256 of Connect's `dist/plugin/code.mjs` when it is built, as the dev Worker names it. Each socket dials `<tunnel>/code/<sha256>/rpc`.
- A Connection that closes the socket with `PLUGIN_MISMATCH` is Mismatched until a socket to it is answered. While Cloud Connect wants Code's Release, or none, it is Updating: the Link keeps relinking and the pill says "Updating Connect…". While it wants another, Code is Stale and moves to its newest build, saying "Updating Code…".
- "Update ke-connect" shows when a Connection is Outdated (`isOutdated`), saying its ke-connect is older than Cloud Connect accepts.
- `CodeClients.make` also hands `open` a `SocketWatch` for each Connection's sockets; `CodeClients.mismatch(id)` says which Release a Connection said it runs, and `CodeClients.link(id)` is relinking while one is.
