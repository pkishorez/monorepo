---
'@kestack/kabuki': patch
---

Every page's `status` has `info`, good to know and never needed to draw: its `render` and `staleTime`, and once `Ready`, where its data came `from` (`server`, `browser` or `cache`), when it `arrivedAt`, when it is `freshUntil`, `null` for a static page, and how long it `took`. The data a server drew the page with is fresh from when the server loaded it. `Router.define(App, { cacheSize })` sets how many copies the Data cache keeps, 50 unless said; Start's browser reads it. The load behind a stale copy joins one already on its way, as a preload's, so a click during a preload of a stale page loads it once.
