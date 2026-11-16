# Start

`@kestack/kabuki/start` serves a routed Kabuki app from the platform its
adapter names, Cloudflare Workers for now. For a URL it reads the Route,
runs the Loaders of the pages it names, starts the Router with each page's
data from what its Loader came to, and draws the result in the Document,
with the Snapshot beside it; the browser hydrates that and carries on. A
server never runs a Runtime, so what it draws is pure. Why is
[ADR 0030](adr/0030-a-server-draws-pages-started-from-their-loaders.md), and
[ADR 0035](adr/0035-a-page-is-an-actor-and-its-place-loads-its-data.md) and
[ADR 0037](adr/0037-a-page-is-defined-apart-from-its-build-and-the-router-holds-its-data.md)
for pages.

When a page is first drawn is its Render Mode, and that is the whole of it:

| Render Mode | Its data is known | Its first drawing                                | A move to it in the browser                     |
| ----------- | ----------------- | ------------------------------------------------ | ----------------------------------------------- |
| static      | at the build      | a file the build wrote, answered by the platform | a `GET` of the answer the build kept: no Loader |
| dynamic     | at the request    | drawn by the server, for this request            | the Loader RPC: its Loader runs                 |
| client      | in the browser    | the pages above it drawn, this one loading       | the Loader RPC: its Loader runs                 |

A page is never drawn earlier than the page above it, so a URL is first
drawn as its deepest page says. Why is
[ADR 0049](adr/0049-a-static-page-is-drawn-at-the-build-from-the-paths-it-lists.md)
and
[ADR 0050](adr/0050-a-page-is-never-drawn-earlier-than-the-page-above-it.md).

## What an app writes

```
src/
  pages/              Page.define and its build per page, its data and Render Mode; Router.define(App, { … })
  app.tsx             default-exports Start.app({ router, view, document, layer })
  loaders.server.ts   default-exports Start.server(loaders), or Start.server({ layer, visitor }).loaders(loaders)
vite.config.ts        plugins: [react(), start({ platform: cloudflare() })]
alchemy.run.ts        Cloudflare.Website.Vite('Site')
```

Three files, each Layer written beside what Requires it, so leaving a
Capability out is a type error where it is left out. No entry, no RPC, no
route table for the server: the plugin writes every entry from these files,
found by name, each overridable in `start({ … })`. Why is
[ADR 0031](adr/0031-each-layer-is-written-beside-what-requires-it.md).

```tsx
// src/app.tsx: drawn on the server and in the browser
import { Start } from '@kestack/kabuki/start';

export const AppView = View.make(AppLive, (self) => …); // the root page
export default Start.app({
  router,
  view: AppView,
  document: Document,
  layer: LiveUpdatesLive,
});
```

```ts
// src/loaders.server.ts: the server only
import { Start } from '@kestack/kabuki/start/server';

export const loaders = router.loaders({
  Blog: () => Posts.list(), // static, no params: a function
  'Blog.Post': {
    // static, and its path names a param: every path it is at, and how one loads
    paths: () => Posts.paths(), // [{ slug: 'hello' }, …]
    load: ({ slug }) => Posts.get(slug),
  },
  Account: () => CurrentUser.viewer, // dynamic: or Page.redirect(…)
});

export default Start.server({
  layer: PostsLive, // reads env.DB with yield* Start.env<WorkerEnv>()
  visitor: CurrentUserLive, // reads the request with yield* Start.Request
}).loaders(loaders);
```

Start reads only these, so every one is checked: a default export that is
not `Start.app(…)`, or not `Start.server(…)`, fails when the
server starts. The bare `AppView` and `loaders` are exported too, for a test
or a story to run with `Router.view(router, AppView)` and Layers of its own.
`AppView` draws the build of the router's root page; `Start.app` refuses any
other. The browser Layer is imported on the
server too, since `app.tsx` is, but never built there: a Layer is a value,
so only a module that touches the browser when it is imported must be kept
out of it.

### The Loaders' Layers: made once, and per visitor

| Layer     | Made                                                   | May read                                         | Used by                                  | For                                 |
| --------- | ------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------- | ----------------------------------- |
| `layer`   | once, at the build, and the first time a request loads | `Start.Env`                                      | every Loader, and a static place's paths | clients of bindings, config, caches |
| `visitor` | for each request that loads a dynamic or client place  | the layer, `Start.Env`, `Start.Request`, headers | dynamic and client Loaders only          | who is signed in                    |

Both are plain Layers, and both are optional: Loaders that Require nothing
are given alone, `Start.server(loaders)`, which is a type error if any of
them Requires something. The platform's env is a
service, `Start.Env`, read typed with `yield* Start.env<WorkerEnv>()`; the
request being answered is `Start.Request`, which only the visitor and the
dynamic and client Loaders get. `.loaders(…)` checks every Loader against the
Layers it may use, and the visitor against the layer: a static place's
answer is kept for everyone, and a build loads it and lists its paths before
anyone visits, so a static Loader, or its `paths`, that Requires a visitor
service is a type error, and on a page whose places are all static the
visitor is never made. At the build `Start.Env` is the build's own env,
`process.env`. The layer is made again if making it failed. The
Loaders are a call of their own so that a Layer written in place, as
`Layer.succeed(…)`, is typed as written. Why two, and why the Loaders come
last, is [ADR 0041](adr/0041-the-loaders-layers-are-made-once-and-per-visitor.md).

`Start.ResponseHeaders` is how a dynamic or client Loader, or the visitor,
adds headers to the response, as a refreshed session's `set-cookie`. On a
page, both do. On `/_kabuki/load` only the visitor does: the answer starts
before the Loaders run, so each place is sent as it is done, and a header a
Loader adds there comes too late; a session is refreshed in the visitor. A
static page has none: it is kept for everyone.

```tsx
// src/document.tsx: any file app.tsx imports
import { Start } from '@kestack/kabuki/start';
import type { DocumentProps } from '@kestack/kabuki/start/types';

export default function Document({ children }: DocumentProps) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <Start.Head />
      </head>
      <body>
        {children}
        <Start.Scripts />
      </body>
    </html>
  );
}
```

An app with no Document is drawn in the plainest one, `Start.Document`:
`<html lang="en">` with `<Start.Head />` and `<Start.Scripts />` in it. `<Start.Head />` draws
the charset and viewport, the title and every Metadata tag, and the styles
and chunks of the client entry; `<Start.Scripts />` the saved History as JSON, the script that hydrates the page, and, where the Router restores scroll, the inline script that puts it back before it hydrates, as TanStack Start's does. Code that must run before the first
paint, like a theme bootstrap, is the Document's own. So is the font: a web
font loaded with `font-display: swap` and nothing preloaded paints the first
frame in another font, then reflows every line when it arrives. Preload the
file the first paint needs, and give it a fallback whose metrics match, so
the page never moves. An app on the Web Platform gets both by passing
`document({ theme })` from `@kestack/web-platform/app/document`, which
preloads Inter and sets its fallback, with the Theme and the device marked
before the first paint.

`Start.useDrawn()` reads, from any component, when the server drew the page
(after its Loaders answered) and by which build, and whether that component
was in the drawing and hydrated, or was drawn later by the browser, after a
move or as part of a client place. It is `null` outside a page Start served,
as in a test or a story.

`Start.useRuntime()` reads the app from the Document, for devtools drawn
around it: what `App.useRuntime()` gives an app drawn with `View.app`, its
one Runtime, running from the first mount, the Step it Seeks, and how to Seek
another Step or Fork to one. It is `null` on the server, which draws each
request from a History of its own and makes no Runtime.

## The Loaders, by Render Mode

`router.loaders({ … })` takes one Loader per place with data, each written
with the options of its Render Mode:

| The place is                  | Its Loader                                  | Handed                            |
| ----------------------------- | ------------------------------------------- | --------------------------------- |
| static, no params of its own  | `(params) => …`, or `{ load }`              | every path param down to it       |
| static, its path names params | `{ paths, load }`; `{ paths }` with no data | the same                          |
| dynamic or client             | `(params, request) => …`, or `{ load }`     | those, its query, and the request |

`paths` answers every path the place is at, each with every path param down
to it, typed as its Schemas read them: `[{ section: 'start', guide: 'install' }]`.
Only a listed path is drawn; any other is not found. A place with no params
of its own lists none: it is wherever the page above it is. A path under one
the page above does not list fails the build, and so does a listed path
whose Loader says not found, Redirects or breaks. A static Loader is not
handed the query, which cannot be listed: the page reads it, as Props.

## At the build

```
vite build
  1. build     the client, then the server
  2. list      Blog.Post's paths: { slug: 'hello' }, { slug: 'again' }
  3. load      Blog(), Blog.Post({ slug }) for each: once, a few at a time
  4. keep      _kabuki/data/<build>/Blog.json, …/Blog.Post/hello.json
  5. draw      blog.html, blog/hello.html, blog/again.html, index.html
```

The plugin builds one more module, for Node, and runs it once the client is
built: the app's own two files, drawn at every URL that ends at a static
place. It writes beside the client's files, so the platform answers them
without the server:

- **The Static Data**, each static place's answer, as the Loader RPC writes
  one, in a file per place and path under the build id:
  `/_kabuki/data/<build>/Blog.Post/hello.json`. A file there never changes,
  so anything in front of the app may keep it for good; on Cloudflare the
  plugin adds `Cache-Control: public, max-age=31536000, immutable` for it to
  `_headers`.
- **Each static page's HTML**, at its URL: `/blog/hello` is
  `blog/hello.html`, `/` is `index.html`. Cloudflare serves it at the URL
  without the `.html`, and sends `/blog/hello.html` and `/blog/hello/` back
  to it; a URL that names no file goes on to the server.
- **Each client page under static ones**, drawn loading as the server
  would, at every path the static pages above it list. One whose own path
  names params, or that needs a query, is left to the server.
- A static page whose URL reads as its index page under it is drawn once,
  as that page; one whose URL cannot be written without a query fails the
  build, since a static page is drawn with none.
- **The App Shell**, `_kabuki/shell.html`, the same for every URL. The
  server answers `GET /_kabuki/shell`, and every URL under a client root,
  with this file where the platform hands it the build's files.

A build runs the app's modules, so they must load there: what only a deploy
or a browser has, such as where an API is, is read when a Layer is built,
never as a module loads. `vite dev` draws nothing ahead: a static Loader
runs when its page is asked for, whatever its `paths` say.

## One request

A URL the build drew is a file, and never gets here. One that is all
static and gets here anyway, where the platform hands the server the
build's files, the build did not list: it is a `404`. A path under the
Static Data with no file is a `404` in this build's, since the build did
not list it, and a `410` in another build's, as after a deploy, or where
the server has no files: the browser then asks the Loader RPC, and goes on
asking it. Any other URL is drawn by the server:

```
GET /account/settings
  1. read      /account/settings → Account › Settings
  2. split     Account, Account.Settings: dynamic, drawn here
  3. load      Account() and Account.Settings(), at once
  4. start     the Router's init at the Route, with each place's data → a Snapshot
  5. draw      <Document><App saved /></Document>, every lazy View resolved
  6. keep      a dynamic place was drawn here: nowhere
```

1. **Read.** A redirect in the router, or a URL not written as its Route is
   (`/blog/hello/`), is a `308` to the Route's URL, with the query it had.
2. **Split.** The places on the Route's path are loaded here up to the first
   client one; that page and those under it are the browser's: they are
   drawn loading, and their Metadata says what it can without their data.
3. **Load.** The Loaders of the places loaded here run at once, each handed
   its params and query, and the request, with the Loaders' Layers: the
   layer, made once, and the visitor, made for this request only if a place
   loaded here is not static. A static place above them is not loaded: its
   answer is read from the Static Data, through the platform's `files`, so
   it is what the build drew with. In dev, and on a platform that hands the
   server no files, its Loader runs, handed its path params alone. A Redirect is a `302`, since it depends on the request, or a
   `308` if the Loader says it is permanent; to its Route, or to the URL
   outside the app it names. Any other
   answer is what its page starts from: a page not found is drawn failed and
   makes the response a `404`; a Loader that broke, its page drawn failed
   and a `500`, logged. The pages above it are drawn as they are.
4. **Start.** The Router's `startAt(url, known)` is its Input; its init,
   holding each place's data from what its Loader came to, and every page's
   init under it, is the Snapshot, saved as a History that starts from it.
   Nothing runs.
5. **Draw.** React draws the Document around the App drawn from that History
   and waits for every lazy View, so the HTML is whole. The lazy Views it drew
   are added to the head, their chunks preloaded and their styles linked,
   each marked with its id.
6. **Keep.** A `200` whose places loaded here are all static is the same for
   everyone until the next deploy, as a client page under static ones is:
   `public, max-age=0, s-maxage=31536000, no-transform`,
   and put in the platform's Cache, if it has one, under the build id and
   the URL before it is sent, so the next request finds it: on Cloudflare it
   is drawn once per deploy per data center. Any other page is
   `private, no-store, no-transform`, with the headers its Loaders added.
   Every page is `no-transform`, so the edge sends the Document as drawn,
   without injecting a script, like Cloudflare's Web Analytics beacon, that
   hydration does not expect. In dev nothing
   is kept.

## In the browser

The client entry reads the saved History from the page, preloads the lazy
Views the head names, and hydrates the Document with the browser's URL,
the Loader RPC behind the Data cache, and the app's own Layer. Once mounted,
the app's one Runtime is made from that History's Snapshot, running. The
page says where the build kept the Static Data: a move to a static place
reads its answer there with a `GET`, and asks the Loader RPC only for the
dynamic and client places. A client
page, drawn loading, has its data loaded by the Router once it starts. The Metadata the server drew is the Router's from
then on: it writes it after every move, and when a page's data comes.

## The Loader RPC

The browser asks for the data of the dynamic and client places asked for in
the same moment at `POST /_kabuki/load`, all of them in one request, and the
server answers each on its own line, as soon as its Loader is done. A static
place is not asked for here once a build kept the Static Data; asked anyway,
or in dev, the server answers it too, from the Static Data where it has it:

```
→ { places: [{ name: 'Teams', params: { team: 'core' } },
             { name: 'Teams.Member', params: { team: 'core', member: 'ada' } }] }
← { "name": "Teams.Member", "outcome": { "_tag": "Loaded", "data": { … } } }
  { "name": "Teams", "outcome": { "_tag": "Loaded", "data": { … } } }
```

An outcome is `Loaded`, `NotFound`, `Redirect` with its Route or a URL
outside the app, and `permanent` if it said so, or `Broken`
with why. Start makes it from `router.every`: params are written with each
place's params Schema, data with its data Schema, a Redirect's Route with
the Route Schema, so it cannot disagree with the router. The server hands
each Loader the request that asked, cookies and all. It is a fixed protocol
of JSON lines rather than an `effect/rpc` group: many places in one request,
each answered as it comes, says it directly; a Loader needs the very
`Request`; and the browser ships no RPC client. A malformed ask is a `400`;
a request that gets no answer breaks the pages it asked for, and each can
retry.

## The Pages and the App Shell

Start knows nothing of service workers, but it tells whatever stands in
front of the app what it needs to know, from the Routes, so it cannot
disagree with them. `GET /_kabuki/pages` (`Start.pages`) answers:

```
{ "build": "…", "shell": "/_kabuki/shell",
  "pages": [{ "name": "Blog.Post", "path": "/blog/:slug", "params": true, "render": "static" }, …] }
```

A page's `render` is how its first drawing is made: `static` when every
place the server draws is static, `client` when it draws none of them,
`dynamic` otherwise. `build` is `null` in dev.

`GET /_kabuki/shell` is the App Shell: the Document, its files, the root's
Metadata and no app, the file the build wrote; in dev, or on a platform
that hands the server no files, drawn and kept per build as a static page
is. The server leaves a
Suspense boundary where the app goes, showing what `Start.app({ loading })`
says, so it paints before any script runs; the browser hydrates the Document
and draws the app in it at its own URL. Its static places start from the
Static Data, read before the first frame if it comes within 150 ms, as it
does from a service worker that keeps it, so a static page opens whole;
every other place starts loading. A service worker can answer any page with
it. Under a `client` root the server does too: every
URL is the App Shell with a `200`, one that names no page included, as the
app reads it in the browser. Only a path with a file extension that names no
page stays a `404`.

## Lazy Views

`View.lazy(ChartLive, () => import('./chart-view.tsx'))` is a View of
`ChartLive` loaded when first drawn; that module default-exports
`View.make(ChartLive, …)`. The plugin gives each one the id of the module it loads, its path from
the Vite root, which is its key in the client manifest, so the server names
the lazy Views it drew in the head and the browser preloads exactly those
before it hydrates. A page's lazy View the server did not draw is found by
its page's build, so it starts loading when a move to it or a preload of it
starts, and its code and its data arrive together. Actors stay eager: Replay
and a loaded Snapshot need every Actor.

## Where the code lives

```
src/start/
  app/         what src/app writes, on both sides: Start.app and the Document's parts         @kestack/kabuki/start
    protocol/  what the server and the browser agree on: the Page, the Pages, the App Shell,
               the Loader RPC's wire, the Static Data's files, the brand on Start.app
  server/      the handler, the Loaders' Layers (Start.server), the RPC's answer, the Cache, @kestack/kabuki/start/server
               and prerender, what the build runs to draw the static pages
  client/      hydrating, for the browser entry the plugin writes                            @kestack/kabuki/start/client
  platform/    the port each platform fills
    cloudflare/  Cloudflare Workers: cloudflare() in vite, its serve in server
    nitro/       any host Nitro has a preset for: nitro() in vite, its serve in server
  vite/        the plugin, with each platform's adapter                                      @kestack/kabuki/start/vite
```

`server`, `client` and `vite` use `app/protocol`, never each other; `server`
and `vite` use `platform`. An app imports `Start` from `@kestack/kabuki/start` in what
both sides run, and from `@kestack/kabuki/start/server` in
`src/loaders.server`, so nothing of the server's reaches the browser's
bundle.

## Platforms

Start's server knows no platform: it is a `Handler`, a `fetch` that takes
each request with a `Host`, the platform's env and, if it has them, a
`PageCache` and `files`, how it reads what the build wrote. Each platform's adapter fills that port from its own folder
under `src/start/platform`. An app names it in `vite.config.ts`, from
`@kestack/kabuki/start/vite`, and the server's entry the plugin writes
imports only that adapter's `serve` from `@kestack/kabuki/start/server`, so
a build carries only the adapter it names. Why is
[ADR 0033](adr/0033-start-knows-no-platform.md).

| Adapter             | Import                       | Builds for                                                                                                                                  | Hands Start                                                                                                                                                             |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflare()`      | `@kestack/kabuki/start/vite` | one module in its edge form, `workerd` first                                                                                                | the Worker's env, `caches.default`, and the build's files from the Worker's assets, `env.ASSETS`                                                                        |
| `nitro({ preset })` | `@kestack/kabuki/start/vite` | Nitro's SSR service, wrapped by Nitro's own plugin, `nitro()`, in the preset's server (Node, Bun, Vercel, Netlify, AWS Lambda, Cloudflare…) | the process's env, or the Worker's on a Cloudflare preset, and `caches.default` where there is one; with none, a static page is kept by the CDN, by its `Cache-Control` |

An adapter is a `Platform` for the Vite plugin, the conditions the server
build resolves with, the function its entry wraps the handler in and what
its host must be told of the files the build wrote, and that function
itself, `serve(handler)`, which the platform runs. Nitro hands the server
the build's files on its Cloudflare presets alone; elsewhere a static Loader
runs when the server is asked for its place.

## The Vite plugin

`start({ platform })` writes five modules of its own: Start's handler, which
knows no platform; the server's entry, `serve(handler)` from the platform's
adapter, its only export; the browser's entry; what the build runs to draw
the static pages; and what the server knows of the build (a build id that
changes on every build, Vite's `base`, where the Static Data is, and the
client's files read from its manifest). It sets the server's entry as the
`ssr` build's input, so the Cloudflare plugin Alchemy injects takes it as
the Worker's `main`, and builds the client first, then the server. Last,
whoever built those, it builds what draws the static pages in an environment
of its own, `prerender`, as one module for Node under
`node_modules/.kabuki-start`, never deployed, and runs it. Built on
its own, the server is one module that carries every dependency, resolved
with the platform's conditions. The manifest it reads is not deployed.
Output goes where the Cloudflare plugin puts it, `dist/client` and
`dist/ssr`.

A module the browser loads that imports a `*.server.*` file fails the build.

## Dev, build and deploy

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react(), start({ platform: cloudflare() })],
});
```

```ts
// alchemy.run.ts, or src/infra/; the Web Platform's `Site` in
// `@kestack/web-platform/app/alchemy` is this with each Stage's domain
export const Site = Cloudflare.Website.Vite('Site', {
  compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
  bindings: { DB: Database },
});
export type WorkerEnv = Cloudflare.InferEnv<typeof Site>;
```

- `vite dev` serves SSR from Vite's own server environment, in Node: the
  plugin hands Start's handler each request with an empty env and no Cache.
  The plugin has Vite scan the app's files for the browser's dependencies,
  since the browser's entry is its own, so the first page does not reload.
- An edit anywhere in the app is a hot reload: React Refresh cannot swap the
  app, a value, so the browser's entry takes itself back and draws the page
  again with the new code, and the app carries on from its History,
  replayed with that code.
- `alchemy dev` runs the same `vite dev` with the Cloudflare plugin, which
  runs the server's entry in workerd with its bindings; the plugin stands
  aside, but has workerd scan the app's server files, and include what
  Start's server imports, so the first page does not find new dependencies
  and reload.
- Styles in dev: Vite adds a stylesheet when its module's code runs, so the
  head links `/@kabuki-start/styles.css`, which `@import`s, as plain CSS,
  every stylesheet the app imported while the server drew the page. The
  browser waits for it before the first paint, and the client entry turns it
  off once the app's own scripts have added their styles, so an edit is
  drawn by Vite's alone. A build links the built stylesheets in the head.
- `vite build` and `alchemy deploy` build the client and the server, then
  draw the static pages into `dist/client`; Alchemy deploys `dist/client` as
  assets and the Worker behind them, asked only for a URL that names no
  file. No `main`
  is needed. A Worker that must export more, like a Durable Object, points
  `main` at a module that re-exports the plugin's:
  `export { default } from 'virtual:kabuki-start/worker'`.

## Not built yet

- Drawing a static path the build did not list when it is first asked for.
- The build's files on Nitro off Cloudflare: the server is handed none, so
  it runs a static Loader when asked for its place.
- `no-transform` on a static page's HTML: the platform serves the file with
  its own headers.
- Drawing at the build under `alchemy deploy` is not yet covered by a test:
  the build's own step is, and so is the built Worker reading its assets.
- A custom `main` re-exporting `virtual:kabuki-start/worker` is not yet
  covered by a test.
- Streaming: a page is sent once it is whole.
- An app mounted under a Router `base` other than the site's root serves the
  Loader RPC at the root's `/_kabuki/load`.
