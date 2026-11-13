---
'@kestack/web-platform': patch
---

Worker RPC is gone: `./pwa/rpc/worker`, `./pwa/rpc/client`, `WorkerHost` and `runServiceWorker`'s `layer` option. No app called its service worker, and a page and a worker that need to talk will get an abstraction of their own. `runServiceWorker()` now takes nothing.
