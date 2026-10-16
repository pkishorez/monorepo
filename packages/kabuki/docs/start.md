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

## What an app writes

```
src/
  pages/              Page.define and Page.build per page, its data and Render Mode; Router.define(App, { … })
  app.tsx             default-exports Start.app(router, AppView, { … })
  loaders.server.ts   default-exports Start.layers<Env>()…loaders(router.loaders({ … }))
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
export default Start.app(router, AppView, {
  document: Document,
  layer: LiveUpdatesLive,
});
```

```ts
// src/loaders.server.ts: the server only
import { Start } from '@kestack/kabuki/start/server';

export const loaders = router.loaders({
  Blog: () => Posts.list(),
  'Blog.Post': ({ slug }) => Posts.get(slug), // fails with Page.notFound()
  Account: () => CurrentUser.viewer, // or Page.redirect(…)
});

export default Start.layers<WorkerEnv>()
  .instance((env) => PostsLive(env.DB))
  .request((env) => PgLive(env.HYPERDRIVE))
  .visitor(({ env, request }) => CurrentUserLive(request))
  .loaders(loaders);
```

Start reads only these, so every one is checked: a default export that is
not `Start.app(…)`, or not `Start.layers()…loaders(…)`, fails when the
server starts. The bare `AppView` and `loaders` are exported too, for a test
or a story to run with `Router.app(router, AppView)` and Layers of its own.
`AppView` draws the build of the router's root page; `Start.app` refuses any
other. The browser Layer is imported on the
server too, since `app.tsx` is, but never built there: a Layer is a value,
so only a module that touches the browser when it is imported must be kept
out of it.

### The Loaders' Layers, in three tiers

| Tier       | Made                                                  | From                    | Used by                         | For                                   |
| ---------- | ----------------------------------------------------- | ----------------------- | ------------------------------- | ------------------------------------- |
| `instance` | once, the first time a request loads                  | the env                 | every Loader                    | clients of bindings, config, caches   |
| `request`  | for each request that loads                           | the env                 | every Loader                    | a database connection over Hyperdrive |
| `visitor`  | for each request that loads a dynamic or client place | the env and the request | dynamic and client Loaders only | who is signed in                      |

Each tier is a call of its own, checked as it is given: the instance tier
Requires nothing, the request tier only what the instance's gives, the
visitor tier what either gives and `Start.ResponseHeaders`. `.loaders(…)`
ends it and checks every Loader against the tiers it may use: a static
place's answer is kept for everyone, so a static Loader that Requires a
visitor service is a type error, and on a page whose places are all static
the visitor tier is never made. The instance tier is made again if making
it failed. `Start.layers<WorkerEnv>()` types the env every tier is made
from. Why three, and a call each, is
[ADR 0032](adr/0032-the-loaders-layers-come-in-three-tiers.md).

`Start.ResponseHeaders` is how a dynamic or client Loader, or the visitor
tier, adds headers to the response, as a refreshed session's `set-cookie`.
On a page, both do. On `/_kabuki/load` only the tiers do: the answer starts
before the Loaders run, so each place is sent as it is done, and a header a
Loader adds there comes too late; a session is refreshed in the visitor
tier. A static page has none: it is kept for everyone.

```tsx
// src/document.tsx: any file app.tsx imports
export default function Document({ children }: Start.DocumentProps) {
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
paint, like a theme bootstrap, is the Document's own.

`Start.useDrawn()` reads, from any component, when the server drew the page
(after its Loaders answered) and by which build, and whether that component
was in the drawing and hydrated, or was drawn later by the browser, after a
move or as part of a client place. It is `null` outside a page Start served,
as in a test or a story.

`Start.useRuntime()` reads the running app from the Document, for devtools
drawn around it: what `App.useRuntime()` gives an app drawn with `toReact`,
its History, the Step shown and how to show another. It is `null` on the
server, which draws each request from a History of its own and runs none.

## One request

```
GET /blog/hello
  1. read      /blog/hello → Blog › Post { slug: 'hello' }
  2. split     Blog, Blog.Post: static, drawn here
  3. load      Blog() and Blog.Post({ slug }), at once
  4. start     the Router's init at the Route, with each place's data → a Restore
  5. draw      <Document><App saved /></Document>, every lazy View resolved
  6. keep      every place drawn here is static: in the Cache, by build id
```

1. **Read.** A redirect in the router, or a URL not written as its Route is
   (`/blog/hello/`), is a `308` to the Route's URL, with the query it had.
2. **Split.** The places on the Route's path are loaded here up to the first
   client one; that page and those under it are the browser's: they are
   drawn loading, and their Metadata says what it can without their data.
3. **Load.** The Loaders of the places loaded here run at once, each handed
   its params and query, and the request unless its place is static, with
   the Loaders' tiers: the instance's, made once; the request's, made for
   this request; and the visitor's only if a place loaded here is not
   static. A Redirect is a `302`, since it depends on the request, or a
   `308` if the Loader says it is permanent; to its Route, or to the URL
   outside the app it names. Any other
   answer is what its page starts from: a page not found is drawn failed and
   makes the response a `404`; a Loader that broke, its page drawn failed
   and a `500`, logged. The pages above it are drawn as they are.
4. **Start.** The Router's `startAt(url, known)` is its Input; its init,
   holding each place's data from what its Loader came to, and every page's
   init under it, is the Snapshot, saved as a History of one Restore.
   Nothing runs.
5. **Draw.** React draws the Document around the App drawn from that History
   and waits for every lazy View, so the HTML is whole. The lazy Views it drew
   are added to the head, their chunks preloaded and their styles linked,
   each marked with its id.
6. **Keep.** A `200` whose places loaded here are all static is the same for
   everyone until the next deploy: `public, max-age=0, s-maxage=31536000, no-transform`,
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
Views the head names, and hydrates the Document with the browser's address,
the Loader RPC behind the Data cache, and the app's own Layer. Once mounted,
the Runtime starts at the Restore. A client page, drawn loading, has its
data loaded by the Router once it starts. The Metadata the server drew is the Router's from
then on: it writes it after every move, and when a page's data comes.

## The Loader RPC

The browser asks for the data of the places asked for in the same moment at
`POST /_kabuki/load`, all of them in one request, and the server answers
each on its own line, as soon as its Loader is done:

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

## Lazy Views

`View.lazy(ChartLive, () => import('./chart-view.tsx'))` is a View of
`ChartLive` loaded when first drawn; that module default-exports
`View.make(ChartLive, …)`. The plugin gives each one the id of the module it loads, its path from
the Vite root, which is its key in the client manifest, so the server names
the lazy Views it drew in the head and the browser preloads exactly those
before it hydrates. A page's lazy View the server did not draw is found by
its page's build, so it starts loading when a move to it or a preload of it
starts, and its code and its data arrive together. Actors stay eager: Replay
and Restore need every Actor.

## Where the code lives

```
src/start/
  common/      both sides: Start.app, the Document's parts, the Page, the Loader RPC's wire   @kestack/kabuki/start
  server/      the handler, the Loaders' tiers (Start.layers), the RPC's answer, the Cache   @kestack/kabuki/start/server
  client/      hydrating, and the Loading that asks the RPC                                  @kestack/kabuki/start/client
  platform/    the port each platform fills                                                  @kestack/kabuki/start/platform
    cloudflare/  Cloudflare Workers                                                          @kestack/kabuki/start/platform/cloudflare
  vite/        the plugin                                                                    @kestack/kabuki/start/vite
```

`server` and `client` use `common`, never each other; `server` and `vite`
use `platform`. An app imports `Start` from `@kestack/kabuki/start` in what
both sides run, and from `@kestack/kabuki/start/server` in
`src/loaders.server`, so nothing of the server's reaches the browser's
bundle.

## Platforms

Start's server knows no platform: it is a `Handler`, a `fetch` that takes
each request with a `Host`, the platform's env and, if it has one, a
`PageCache`. Each platform's adapter fills that port from its own folder
under `src/start/platform`, imported from its own subpath, so a build
carries only the adapter it names. Why is
[ADR 0033](adr/0033-start-knows-no-platform.md).

| Adapter        | Import                                      | Builds for                                   | Hands Start                           |
| -------------- | ------------------------------------------- | -------------------------------------------- | ------------------------------------- |
| `cloudflare()` | `@kestack/kabuki/start/platform/cloudflare` | one module in its edge form, `workerd` first | the Worker's env and `caches.default` |

An adapter is a `Platform` for the Vite plugin, the conditions the server
build resolves with and the function its entry wraps the handler in, and
that function itself, `serve(handler)`, which the platform runs.

## The Vite plugin

`start({ platform })` writes four modules of its own: Start's handler, which
knows no platform; the server's entry, `serve(handler)` from the platform's
adapter, its only export; the browser's entry; and what the server knows of
the build (a build id that changes on every build, Vite's `base`, and the
client's files read from its manifest). It sets the server's entry as the
`ssr` build's input, so the Cloudflare plugin Alchemy injects takes it as
the Worker's `main`, and builds the client first, then the server. Built on
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
// alchemy.run.ts, or src/infra/ as apps/docs does
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
- `vite build` and `alchemy deploy` build the client and the server; Alchemy
  deploys `dist/client` as assets and the Worker in front of them. No `main`
  is needed. A Worker that must export more, like a Durable Object, points
  `main` at a module that re-exports the plugin's:
  `export { default } from 'virtual:kabuki-start/worker'`.

## Not built yet

- An adapter for any platform but Cloudflare: the port is shaped by one
  adapter until a second proves it.
- Caching the Loader RPC's answers for static places.
- A custom `main` re-exporting `virtual:kabuki-start/worker` is not yet
  covered by a test.
- Streaming: a page is sent once it is whole.
- An app mounted under a Router `base` other than the site's root serves the
  Loader RPC at the root's `/_kabuki/load`.
