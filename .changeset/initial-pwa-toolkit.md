---
'@kstackz/pwa-toolkit': patch
---

Initial release under the `@kstackz` scope.

Turns a TanStack Start app into an installable, offline-capable PWA: a Vite plugin that builds the service worker and precache, runtime caching rules, update and install prompts, Worker RPC, and a Kill Switch build. You need it because the usual PWA plugins expect an `index.html`, and a server-rendered Start app has none.
