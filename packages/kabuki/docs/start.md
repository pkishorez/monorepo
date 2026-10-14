# Start

`@kestack/kabuki/start` serves a routed Kabuki app from a Cloudflare Worker.
For a URL it reads the Route, runs the Loaders of the places it names, starts
every page from its Input and draws the result in the Document, with the
Snapshot beside it; the browser hydrates that and carries on. A server never
runs a Runtime, so what it draws is pure. Why is
[ADR 0030](adr/0030-a-server-draws-pages-started-from-their-loaders.md).

## What an app writes

```
src/
  routes.ts           the Routes: every place, its Input and Render Mode
  app.tsx             default-exports Router.app(Routes, App)
  loaders.server.ts   default-exports Routes.loaders({ … })      if a place has an Input
  layer.server.ts     default-exports what the Loaders Require   optional
  layer.client.ts     default-exports what the Actors Require    optional
  document.tsx        default-exports the Document               optional
vite.config.ts        plugins: [react(), start()]
alchemy.run.ts        Cloudflare.Website.Vite('Site')
```

No entry, no RPC, no route table for the server: the plugin writes every
entry from these files, found by name, each overridable in `start({ … })`.

```ts
// src/app.tsx
export default Router.app(Routes, App);
```

```ts
// src/loaders.server.ts
export default Routes.loaders({
  Blog: () => Posts.list(),
  'Blog.Post': ({ slug }) => Posts.get(slug), // fails with Route.notFound()
  Account: (_params, request) => Auth.viewer(request), // or Route.redirect(…)
});
```

```ts
// src/layer.server.ts: made for each request, from the Worker's env
export default (env: WorkerEnv) => PostsLive(env.DB);
```

```tsx
// src/document.tsx
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

An app with no Document is drawn in the plainest one: `<html lang="en">`
with `<Start.Head />` and `<Start.Scripts />` in it. `<Start.Head />` draws
the charset and viewport, the title and every Metadata tag, and the styles
and chunks of the client entry; `<Start.Scripts />` the saved History as JSON
and the script that hydrates the page. Code that must run before the first
paint, like a theme bootstrap, is the Document's own.

`Start.useDrawn()` reads, from any component, when the server drew the page
(after its Loaders answered) and by which build, and whether that component
was in the drawing and hydrated, or was drawn later by the browser, after a
move or as part of a client place. It is `null` outside a page Start served,
as in a test or a story.

## One request

```
GET /blog/hello
  1. read      /blog/hello → Blog › Post { slug: 'hello' }
  2. split     Blog, Blog.Post: static, drawn here
  3. load      Blog() and Blog.Post({ slug }), at once
  4. start     the Router's init at the Route with those Inputs → a Restore
  5. draw      <Document><App saved /></Document>, every lazy View resolved
  6. keep      every place drawn here is static: in the Cache, by build id
```

1. **Read.** A redirect in the Routes, or a URL not written as its Route is
   (`/blog/hello/`), is a `308` to the Route's URL, with the query it had.
2. **Split.** The places on the Route's path are drawn here up to the first
   client one; that place and those under it are the browser's. The client
   place's Outlet is drawn empty, with an Input or without one, and its
   Metadata says what it can without its Input.
3. **Load.** The Loaders of the places drawn here run at once, each handed
   its params, and the request unless its place is static, with the app's
   server Layer, made for this request from the Worker's env. A Loader that
   fails as not found draws the not-found Route with a `404`; a Redirect is a
   `302`, since it depends on the request. Anything else is a `500`, logged.
4. **Start.** `Root.startAt(url, inputs)` is the Router's Input; its init,
   and every page's init from its Input, is the Snapshot, saved as a History
   of one Restore. Nothing runs.
5. **Draw.** React draws the Document around the App drawn from that History
   and waits for every lazy View, so the HTML is whole. The lazy Views it drew
   are added to the head, their chunks preloaded and their styles linked,
   each marked with its id.
6. **Keep.** A page whose places drawn here are all static is the same for
   everyone until the next deploy: `public, max-age=0, s-maxage=31536000`,
   and put in the Cloudflare Cache under the build id and the URL before it
   is sent, so the next request finds it: it is drawn once per deploy per
   data center. Any other page is
   `private, no-store`. In dev nothing is kept.

## In the browser

The client entry reads the saved History from the page, preloads the lazy
Views the head names, and hydrates the Document with the browser's address
and the Loader RPC in the Layer. Once mounted, the Runtime starts at the
Restore. A client place, drawn without its Input, is a pending move from
init, so it loads exactly as after a click. The Metadata the server drew is
the Router's from then on: it writes it after every move.

## The Loader RPC

The browser asks for the Inputs of the places a move needs at
`POST /_kabuki/load`, all of them in one request:

```
→ { places: [{ name: 'Blog.Post', params: { slug: 'again' } }] }
← { _tag: 'Loaded', inputs: { 'Blog.Post': { … } } }
  | { _tag: 'NotFound' }
  | { _tag: 'Redirect', route: { _tag: 'SignIn' } }
```

Start makes it from `Routes.every`: params are written with each place's
params Schema, Inputs with its Input Schema, a Redirect's Route with the
Route Schema, so it cannot disagree with the Routes. The server hands each
Loader the request that asked, cookies and all. It is a fixed JSON protocol
rather than an `effect/rpc` group: a move asks for every place at once, which
one request with one answer says directly; a Loader needs the very
`Request`; and the browser ships no RPC client. A malformed ask is a `400`;
a request that gets no answer leaves the page as it is.

## Lazy Views

`View.lazy(() => import('./chart-view.tsx'))` is a View loaded when first
drawn. The plugin gives each one the id of the module it loads, its path from
the Vite root, which is its key in the client manifest, so the server names
the lazy Views it drew in the head and the browser preloads exactly those
before it hydrates. A lazy View the server did not draw, like a client
place's, starts loading when the Router starts loading its place's Input,
on the first page as after a click, so its code and its Input arrive
together. Actors stay eager: Replay and Restore need every Actor.

## The Vite plugin

`start()` writes three modules of its own: the Worker's entry, the browser's,
and what the Worker knows of the build (a build id that changes on every
build, Vite's `base`, and the client's files read from its manifest). It sets
the Worker's as the `ssr` build's input, so the Cloudflare plugin Alchemy
injects takes it as the Worker's `main`, and builds the client first, then
the Worker. Built on its own, the Worker is one module that carries every
dependency in its edge form and exports only its handler, as workerd needs;
under the Cloudflare plugin, the plugin decides. The manifest it reads is not
deployed. Output goes where the Cloudflare plugin puts it, `dist/client` and
`dist/ssr`.

A module the browser loads that imports a `*.server.*` file fails the build.

## Dev, build and deploy

```ts
// vite.config.ts
export default defineConfig({ plugins: [react(), start()] });
```

```ts
// alchemy.run.ts, or src/infra/ as apps/docs does
export const Site = Cloudflare.Website.Vite('Site', {
  compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
  bindings: { DB: Database },
});
export type WorkerEnv = Cloudflare.InferEnv<typeof Site>;
```

- `vite dev` serves SSR from Vite's own server environment, in Node, with
  no bindings: the Worker's `env` is `{}`. The plugin has Vite scan the
  app's files for the browser's dependencies, since the browser's entry is
  its own, so the first page does not reload.
- An edit anywhere in the app is a hot reload: React Refresh cannot swap the
  app, a value, so the browser's entry takes itself back and draws the page
  again with the new code, and the app carries on from its History,
  replayed with that code.
- `alchemy dev` runs the same `vite dev` with the Cloudflare plugin, which
  runs the Worker in workerd with its bindings; the plugin stands aside, but
  has workerd scan the app's server files, and include what Start's Worker
  imports, so the first page does not find new dependencies and reload.
- Styles in dev: Vite adds a stylesheet when its module's code runs, so the
  head links `/@kabuki-start/styles.css`, which `@import`s, as plain CSS,
  every stylesheet the app imported while the server drew the page. The
  browser waits for it before the first paint, and the client entry turns it
  off once the app's own scripts have added their styles, so an edit is
  drawn by Vite's alone. A build links the built stylesheets in the head.
- `vite build` and `alchemy deploy` build the client and the Worker; Alchemy
  deploys `dist/client` as assets and the Worker in front of them. No `main`
  is needed. A Worker that must export more, like a Durable Object, points
  `main` at a module that re-exports the plugin's:
  `export { default } from 'virtual:kabuki-start/worker'`.

## Not built yet

- Caching the Loader RPC's answers for static places.
- A custom `main` re-exporting `virtual:kabuki-start/worker` is not yet
  covered by a test.
- Streaming: a page is sent once it is whole.
- An app mounted under a Router `base` other than the site's root serves the
  Loader RPC at the root's `/_kabuki/load`.
