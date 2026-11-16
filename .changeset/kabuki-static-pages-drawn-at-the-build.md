---
'@kestack/kabuki': patch
---

A static page is drawn at the build, and a page is never drawn earlier than the page above it.

- **Static pages are files.** `vite build` now draws every URL that ends at a static place and writes its HTML beside the client's files, so the platform answers it without the server. Each static place's answer is kept beside it as the Static Data, one JSON file per place and path under the build id: `/_kabuki/data/<build>/Blog.Post/hello.json`.
- **The build writes the App Shell and the client pages it can.** `_kabuki/shell.html` is the App Shell, which the server answers `/_kabuki/shell` and every URL under a client root with. A client page under static ones is drawn loading at each path they list, unless its own path names params or it needs a query.
- **A static place with params lists its paths.** Its Loader is `{ paths, load }`, or `{ paths }` with no data; only a listed path is drawn, and any other is not found. Leaving `paths` out is a type error. A Loader may also be written `{ load }` in any mode.
- **An unlisted path is a `404`, and a deploy does not break an open tab.** A URL that is all static and reaches the server was not listed. A tab from the build before gets a `410` for its Static Data, and loads through the Loader RPC instead.
- **A static Loader runs once per build.** In the browser a move to a static place reads its file with a `GET`; the server reads the same file through the platform's new `Host.files` when it draws a dynamic or client page under a static one. On Cloudflare the files come from the Worker's `ASSETS`.
- **Breaking: a static Loader is handed its path params alone**, never its query. A page whose data depends on the query is `dynamic` or `client`.
- **Breaking: no page says `render: 'static'`.** An app starts static and a page says only `'dynamic'` or `'client'`; `dynamic` under a client page is a type error on `Router.define`, and an error when the router is made.
- **A build runs the app.** It builds one more module, for Node, to draw with, so the app's modules must load there: read what only a deploy or a browser has when a Layer is built, never as a module loads.
- `prerender` is exported from `@kestack/kabuki/start/server`, for tests.
