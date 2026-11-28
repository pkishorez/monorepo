---
'@kestack/devtools': patch
---

`pnpm dev` runs DevTools as one process on `127.0.0.1:14400`, the published CLI's port: the DevTools Server, with Vite inside it for the UI and hot reload. Portless and the separate Vite port are gone, so agents and Kabuki apps reach DevTools at the same address in dev and in production. The port is fixed at 14400; `DEVTOOLS_DB` still picks the database. Like production, dev now answers only on its own origin, so a tunnel no longer reaches it. The CLI no longer reads `DEVTOOLS_SKIP_UI_CHECK`.
