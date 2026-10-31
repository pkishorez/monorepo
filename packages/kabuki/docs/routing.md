# Routing

`@kestack/kabuki/routing` adds routing to a Kabuki app without changing how
an app is written: a page is an Actor with a place in the URL, defined and
built as any Actor is, the Router is one Actor above them, and a page's data
is handed to it as Props. Core never imports it. Why it is built this way is
in [ADR 0035](adr/0035-a-page-is-an-actor-and-its-place-loads-its-data.md)
and [ADR 0037](adr/0037-a-page-is-defined-apart-from-its-build-and-the-router-holds-its-data.md).

## Four parts

```
Your pages and Views         Page.define, Page.build, View.make     plain Kabuki Actors
Router definition            Router.define(App, { … })             read down from the pages: Schemas, URL ⇄ Route, Metadata
Router + Adapter             Router.app(router, AppView)           holds where the app is and every page's data; talks to the URL
Data                         held by the Router                    loads each page's data, hands it down as `status`
```

### Where the code lives

```
src/routing/
  namespaces/     page.ts and router.ts: the Page and Router namespaces the door gives
  route/          Routes as data: node.ts (the types), values.ts, places.ts, url.ts,
                  metadata.ts, loader.ts; route.ts makes the Routes from the pages
  capabilities/   what pages and the Router share: Navigation, Loading, the Data cache
  page/           page.ts: Page.define and Page.build; status.ts: what a page is handed;
                  failures.ts: Page.notFound and Page.redirect
  router/         router.tsx: the Router Actor, Router.app, put together from one file
                  per job: model, urls, moves, loads, updates, workers, view and commands;
                  define.ts: Router.define; data.ts: the data of every place on screen;
                  context.tsx: links, hooks, the Metadata in the document;
                  frame.tsx: what it draws around the app
    scroll/       scroll restoration, as TanStack Router's: kept per entry, put back after each move
    adapter/      the port: where the address lives            @kestack/kabuki/routing/adapter
      browser/    the browser's own history                    @kestack/kabuki/routing/browser
      tanstack/   TanStack Router's history                    @kestack/kabuki/routing/tanstack
```

`route` is pure data and depends on nothing else here, so Start reads it
without the Router. `capabilities` uses `route`; `page` uses `route` and
`capabilities`; `router` uses all three, and holds the Adapter and scroll
restoration, which only it uses.

## A page

```tsx
export const Task = Page.define({
  path: '/tasks/:task',
  params: { task: Schema.String },
  data: TaskData,
  metadata: ({ task }, data) => ({ title: data?.title ?? `Task ${task}` }),
  model: Schema.Struct({ draft: Schema.NullOr(Schema.String) }),
  state: Schema.TaggedUnion({ Reading: {}, Editing: {} }),
  message: Schema.TaggedUnion({
    Edit: {},
    Typed: { text: Schema.String },
    Saved: {},
  }),
});

export const TaskLive = Page.build(Task, {
  init: () => ({ model: { draft: null }, state: { _tag: 'Reading' } }),
  on: {
    Edit: (_, { props }) =>
      props.status._tag === 'Ready'
        ? {
            model: { draft: props.status.data.notes },
            state: { _tag: 'Editing' },
          }
        : {},
    Typed: ({ text }) => ({ model: { draft: text } }),
    Saved: () => ({ state: { _tag: 'Reading' }, command: Router.reload() }),
  },
});

export const TaskView = View.make(TaskLive, ({ props }) => {
  switch (props.status._tag) {
    case 'Loading':
      return <TaskSkeleton />;
    case 'Failed':
      return <Failed reason={props.status.reason} />;
    case 'Ready':
      return <TaskBody task={props.status.data} />;
  }
});
```

A page is made in the two steps any Actor is. `Page.define` is
`Actor.define` with a place in the URL, and every field is optional: `path`,
`params`, `query`, `data` (its Loader's Schema), `render`, `metadata` and
`pages`, then the Actor's own `requires`, `model`, `state` and `message`.
`Page.build` takes how it behaves, at the top and per State, as
`Actor.build` does. A page with nothing to do is still built,
`Page.build(Home)`, as long as it has no pages, no State Schema and no init
it needs. Every page has `Navigation`: it never lists it in `requires`.

A page takes no Input: it exists before its data. It is handed Props:

- `params` and `query`: its own, typed from its Schemas.
- `status`, if it has `data`: `Loading`, `Failed { reason, notFound }`, or
  `Ready { data, refreshing }`. `refreshing` is true while the data loads
  again behind what is shown. Its View draws all three with a `switch`, and
  its Updates read it as Props: to keep an editable copy, an Update copies it
  into the Model. Each also has `info`, good to know and never needed to
  draw:

  | `info`       | On        | What it says                                                                |
  | ------------ | --------- | --------------------------------------------------------------------------- |
  | `render`     | every one | `static`, `dynamic` or `client`                                             |
  | `staleTime`  | every one | its Stale time, in ms; `null` for a static page                             |
  | `from`       | `Ready`   | `server`, in the page the server drew; `browser`, loaded; `cache`, a copy   |
  | `arrivedAt`  | `Ready`   | when the data arrived, in ms since the epoch: the Stale time counts from it |
  | `freshUntil` | `Ready`   | when it goes stale, in ms since the epoch; `null` for a static page         |
  | `took`       | `Ready`   | ms from asking to the answer, the network's time too; `null` for a copy     |

  It comes in the Router's Messages, as the data does, so a past Step shows
  it as it was.

- `route`: where it sits. `route.name` is its dotted name; `route.page` is the Route one level down, if the
  URL goes on; `route.params` every path param down to it, its ancestors'
  too, typed loosely; the root's `route.notFound` is the path of a URL that
  names no page.

A page is drawn with core's `View.make(TaskLive, draw)`, as any Actor is.
`View.lazy(TaskLive, () => import('./task.view.tsx'))` loads its code when
first drawn, or when a move to it or a preload starts; that module
default-exports `View.make(TaskLive, …)`.

### Pages under a page

```tsx
export const Project = Page.define({
  path: '/projects/:id',
  params: { id: Schema.FiniteFromString },
  data: ProjectData,
  pages: { Task, Files },
});

export const ProjectLive = Page.build(Project, {
  pages: { Task: TaskLive, Files: FilesLive },
});

export const ProjectView = View.make(ProjectLive, (self) => (
  <section>
    <ProjectHeader status={self.props.status} />
    {self.children.Task && <TaskView instance={self.children.Task} />}
    {self.children.Files && <FilesView instance={self.children.Files} />}
    {!self.props.route.page && <Overview />}
  </section>
));
```

The definition names the definitions of the pages under it; the build names
the build of each, under the same keys. A build for every page is required,
built from that page's definition, or the build throws. Each key of `pages`
names a page under it, and is its name: `Project.Task`. Kabuki adds one
Child per page, by its key, beside the page's own: there while the URL names
it, and made again when its params change, so new params are a new page with
fresh state, and a new query is the same page. `self.children.Task` is the
task page itself. A page with pages is a place on its own when the URL ends
at it, so there is no index page: the parent draws what it shows there. A
parent decides where and whether its pages are drawn, and can draw one
whatever its own status: a parent and its page load side by side.

### The router: read down from the root

```ts
export const App = Page.define({
  metadata: { description: 'Acme, the app' },
  pages: { Home, Blog, Projects },
});

export const router = Router.define(App, {
  redirect: { '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) },
  notFound: { title: 'Not found', robots: 'noindex' },
  preload: 'intent',
  preloadDelay: 50,
});
```

The root page has no path and no data; its own `metadata` is under every
place's. `Router.define` walks its `pages` down, from definitions alone: it
never imports a build or a View.

- `router.Projects.Task({ id: 4, task: 'a' })` is a Route value, `{ _tag:
  'Projects', id: 4, page: { _tag: 'Task', task: 'a' } }`; `router.Projects({
  id: 4 })` ends at the project. Params are checked by type. The type of any
  Route is `typeof router.route.Type`.
- `router.read(url)` and `router.path(route)` turn a URL into a Route and
  back. A URL that names no place, or a param that does not read, is
  `NotFound`. A redirect's path can hold params, handed to it as strings.
- `router.paths()` prints every place's path as written from the root. Two
  places at one path are refused when the router is made.
- `router.places(route)` lists the places on a Route's path, each with its
  dotted name, its key, what its Loader is handed and its Render Mode;
  `router.every` lists every place as Schemas, with its Stale time, which is what a Loader RPC is
  made from; `router.place` is the Schema of every dotted name.

Its options are how the Router behaves too: `redirect`, `notFound` (the
not-found Route's Metadata, over the root page's), `base`, `delay`,
`preload`, `preloadDelay`, `staleTime` (every dynamic or client page's that
says none, 0 unless said), `cacheSize` (how many copies the Data cache
keeps, 50 unless said), and the scroll options below.

#### Moving from an Update

Since the router is made from definitions alone, a build can import it and
hand the Router the Route itself:

```ts
Saved: () => ({ command: Router.push(router.Projects({ id: 4 })) }),
```

The Route is typed in full: a page that does not exist, or a param of the
wrong type, does not compile. Definitions never import the router and builds
may, so the router's type never waits on a build's. Every move takes a Route:
`push`, `replace`, `backTo`, `preload`, and `Navigation`'s Requests in a
Worker.

A module that holds a page's definition and its build, and imports the
router, is imported by the router back. Then the router reads the root
lazily, when it is first used: `Router.define(() => App, { … })`. That
works as long as nothing reads the router while the modules load. When
nothing the router imports imports it back, `Router.define(App, { … })` reads
it at once.

#### Metadata

`metadata` is a value, or worked out from the page's params and query and its
data, `undefined` until it is there. The deepest place that says a field
wins, field by field, Open Graph's too; the root page's is under them all.
`router.metadata(route or url, data)` is pure, so a server can call it. In
the browser the Router writes it again when a page's data comes, not only on
a move.

#### Data and Render Modes

`data`, a Schema, says a page needs a Loader. `render` is `static`, the
default, `dynamic` or `client`, inherited by the pages under it; any mode may
sit under any other. A server draws a page's data for `static` and `dynamic`;
a `client` page, and every page under it, is sent loading, and the browser
loads it.

`staleTime`, in milliseconds, is how long a copy of a page's data stays
fresh in the Data cache once it arrives: see [Stale time](#stale-time). It
is inherited by the pages under it, and only a `dynamic` or `client` page
has one: a static page's data is fresh until the next deploy, so
`staleTime` on it is a type error, or an error when the router is made if
the page is static from its parent.

#### Loaders

```ts
export default router.loaders({
  Projects: ({ id }) => Db.project(id),
  'Projects.Task': ({ id, task }) => Db.task(id, task),
  Search: ({ q }, request) => Search.run(q, request),
});
```

`router.loaders` is a typing helper and runs nothing: one function per place
with data, by its dotted name, and no other. A Loader is handed every path
param down to it and its own query; a dynamic or client place's, the request
too. Each returns its data, or fails with `Page.notFound()` or
`Page.redirect(…)`, below; a defect breaks its page alone. Missing, extra or
wrong-typed is a type error that names the places. A child that needs its
parent's data calls the same service; a request-scoped Layer makes it run
once.

### Redirects

A redirect sends the app somewhere other than the URL asked for. There are
two kinds, and the rule is: a move that never changes goes in the router; one
that depends on who asks goes in a Loader.

**In the router**, for a URL that is never a place: an old path, a renamed
section.

```ts
Router.define(App, {
  redirect: { '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) },
});
```

A server answers a `308` to the Route's URL, with the query it had. In the
browser the address is replaced, so Back never returns to the old URL.

**In a Loader**, for a place this visitor may not see, or that has moved:

```ts
Page.redirect(router.SignIn()); // 302 to a Route of the app
Page.redirect(router.Blog.Post({ slug }), { permanent: true }); // 308
Page.redirect('https://accounts.example.com/sign-in'); // 302 out of the app
```

- A server answers a `302`, or a `308` with `permanent`, and never keeps it.
  Loaders run side by side, so the outermost place's Redirect wins.
- In the browser, during a move, the move goes on to the Route, as a push,
  or a replace if it was Back or Forward; eight Redirects in a row land on
  not found. For a page already on screen, reloading or with a new query,
  the Route replaces the entry. A whole URL is left for in place of the
  entry; in memory, the move is dropped and nothing is left.
- The Route is typed: a Loader can Redirect only to a Route of its own
  router. A URL must be whole, `http://` or `https://`: a path of the app is
  a Route.

**Guarding a section.** There is no guard: who may see a place is its
Loader's to say. Write the check once and have each Loader under the section
call it; a page with no data has no Loader, and nothing to hide.

```ts
const signedIn = (request: Request) =>
  Session.viewer(request).pipe(
    Effect.flatMap((viewer) =>
      viewer
        ? Effect.succeed(viewer)
        : Effect.fail(Page.redirect(router.SignIn())),
    ),
  );

export default router.loaders({
  Account: (_, request) => signedIn(request),
  'Account.Settings': (_, request) =>
    signedIn(request).pipe(Effect.flatMap((viewer) => Db.prefs(viewer))),
});
```

A request-scoped Layer makes `Session.viewer` run once for the whole page.

**The query.** A Route holds only the query its pages read. A URL with more,
like `?utm_source=`, is left in the address as it is, so a script on the
page can read it, and Back returns to it as the browser kept it; every move
the app makes writes its Route alone. A server keeps the query on a router
redirect's `308`; a redirect the browser follows writes its Route alone.

**Not yet.** A Loader cannot say where the visitor was going, for a sign-in
page to send them back: on a server's first drawing `request.url` is the
page's, but in the browser a Loader is handed the Loader RPC's request, at
`/_kabuki/load`.

## The Router holds every page's data

There is no Actor around a page. The Router keeps the data of every place
with data on the Route drawn, one entry per place, by dotted name, in its
own Model, and hands each page its own as `status`, down through the pages
above it: each page passes on only the statuses under it.

- **Starts** as a move lands, each new place from what is known: the data
  the move loaded before it landed, the server's, or the Data cache's copy,
  which it shows and loads again. Knowing nothing, `Loading`. A place whose
  key, its name and path params, did not change keeps what it has.
- **Loads** with the Router's `place` Worker, one run per place whose data
  is due: while it is Loading, after a reload, on a copy the Data cache
  kept, or when its query changes. The data shown stays meanwhile,
  `refreshing`. A loading screen stays at least 300ms, so it never flashes.
- **Settles** each answer into its place: `Ready`, or `Failed`, not found or
  broken, its own page alone. Loading again behind data shown keeps the data
  when it fails for the same query. A Redirect replaces the entry, or leaves
  the app for a URL outside it. An answer
  for a place no longer on screen is dropped.

Its Messages are `PlaceLoaded`, `PlaceFailed`, `PlaceRedirected` and
`RedirectedAway`, each on
the Timeline, Sent to the Router.

## The Router: one Actor above the app

`Router.app(router, AppView)` makes the Router Actor from the router
definition and the root page's View; `AppView` must draw a build of the
router's root page, or it throws. Under Start an app writes
`Start.app({ router, view: AppView, document, layer })`, which calls it. Its Model
is the history, `entries` and `at`, each entry a Route, the last `move`, the
`pending` move it holds, and the data of every place on screen. Its one
Child is the root page's build, named `App`; each page under it is named
after its key. Every move is one Message to it:

| Message           | Sent by                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `Pushed`          | a click on a `Router.Link`, or `Router.push`                      |
| `Replaced`        | `Router.replace`                                                  |
| `Went`            | `Router.back` and `Router.forward`, `useRouter`                   |
| `WentBackTo`      | `Router.backTo`                                                   |
| `Arrived`         | the Adapter: Back, Forward, a typed URL, a fresh load             |
| `Loaded`          | the `load` Worker, with what the held move's new pages start from |
| `Redirected`      | the `load` Worker, when a Loader Redirects                        |
| `Waited`          | the `wait` Worker, when the move has waited its delay             |
| `PlaceLoaded`     | the `place` Worker, with one place's data                         |
| `PlaceFailed`     | the `place` Worker, when one place is not found or broke          |
| `PlaceRedirected` | the `place` Worker, when a page on screen's Loader Redirects      |
| `RedirectedAway`  | either Worker, when a Loader Redirects to a URL outside the app   |
| `Reloaded`        | `Router.reload`, `Router.Retry`, a link to the page shown         |
| `Preloading`      | a `Router.Link` that preloads, or `Router.preload`                |

It Provides `Navigation` to every page, so a page returns `Router.push(…)`
as a Command without listing it. An Actor under a page that moves the app
lists `Navigation` in its Requires.

### A move, held up to 150ms

A move to pages whose data is not on screen is held: the page shown stays,
`useRouter().pending` says where it goes, and a Worker asks `Loading` for
the new pages' data. If it comes within the delay, or the Data cache has it,
the move lands with each new place `Ready`, and no loading screen shows.
Past the delay the move lands anyway, and each new place shows it is loading
and is loaded on its own; a place's load joins the one the move started.
Pages whose key, name and path params, did not change are kept, with their
state. A newer move drops an older answer. `Router.define(App, { delay })`
changes the 150ms.

### The Data cache

The Router never loads data itself: it asks `Loading`, which a server or a
test answers by running the Loaders, `Loading.memory`, and Start's browser by
calling the Loader RPC. `Loading.cached(router, loading)` puts the Data cache
in front of one; Start's browser does, a server never does, since a copy
there would be shared by every visitor. It keeps the last data of each
place, one copy per name and what its Loader is handed, the newest, up to
the router's `cacheSize`, 50 unless said, the least recently used dropped
first, never one for its age; a failure is never kept. A move
to a page with a copy, Back, Forward or a plain link, starts it `Ready` at
once: a fresh copy as it is, an older one `refreshing`, loaded again behind
it. A place
being loaded is joined, never asked for twice, by a move or by the load
behind an older copy; a Reload's load joins nothing. Places asked for in the same
moment are one request, each answered as it comes. The data a server drew the
page with is kept the same way as the browser starts it, so Back to the
first page is at once too.

### Stale time

A copy is fresh for its page's Stale time from when it arrives; the data a
server drew the page with arrived when the server loaded it. A page's
`status.info.freshUntil` says when its data goes stale.

```ts
const Feed = Page.define({
  path: '/feed',
  render: 'dynamic',
  data: FeedData,
  staleTime: 30_000,
});
export const router = Router.define(App, { staleTime: 5_000 });
```

- A move or a Preload to a page whose copy is fresh shows it and loads
  nothing; an older copy is shown `refreshing` and loaded again behind it.
- A page's own, else its parent's, else the router's: 0 unless said, so
  every copy of a dynamic or client page is loaded again when shown. A
  static page's copy is fresh until the next deploy.
- A Reload loads every page on screen whatever its Stale time, and drops
  every other copy.

### Reload and retry

`Router.reload()`, a Command, `useRouter().reload()`, or `<Router.Retry>`, a
button, loads every page on screen again: their data stays shown,
`refreshing`, and the pages, their Models and States, are kept. A failed
page goes back to loading. Every other copy in the Data cache is dropped. A
link to the page shown does the same.

`Router.reload({ anew: true })` is for when what the data belongs to
changed, as the signed-in account: the data shown is no one's any more, so
it is never loaded behind. The Router holds it as a move, up to its delay,
then each page shows it is loading. `{ anew: true, hold: true }` holds it
until the new data comes, however long, so no page shows it is loading and
the new data takes the old's place in one step. The Command ends once it
lands, or once a move takes its place, so the Update that asked shows the
wait, as an Account Switch dims the page it holds.

### Preload

`<Router.Link to={…} preload="intent" | "viewport" | false preloadDelay={…}>`
asks the Router to preload where it goes: on hover, focus or touch after the
delay, 50ms; once the link scrolls into view; or never. `'intent'` unless the
link or the router says. Each ask is a `Preloading` Message; the Router's
Command warms the Data cache and the code of the lazy Views on that Route,
and nothing comes back: a place with a fresh copy is not loaded. A preload
of the page shown, or of the move held, asks nothing. `Router.preload(route)`
does the same from an Update. A move during a preload joins it, and one
after it shows the copy as its Stale time says. With no Data cache, from
`Loading.cached`, only the code is preloaded.

### The Adapter: where the address lives

With no Adapter in the Layer, the app routes in memory: Back and Forward are
`Went` Messages and the URL is never touched. That is the default, so a test
or a story runs the real router.

```ts
const Root = Router.app(router, AppView);

View.app(Root.view, {
  layer: Layer.mergeAll(AppLayer, tanstack()),
  input: Root.startAt,
});
```

With an Adapter, the Router writes each move to the address with a Command,
stamping each history entry with a key, and a Worker hears the address: a
Back lands on an entry the Router knows. A redirect, or a URL that is not how
its Route is written, is replaced. `startAt(url, known)` is the Router's
Input at a URL with what its pages start from: what a server draws from, and
how an app is drawn at the right page from the first frame.

Commands never run during Time Travel, so the address stays live: a past
Step is a drawing. Nothing fetches either: each page's data is in the
Router's Model, and a fetched answer is in the Message that brought it.

## Scroll

```ts
export const router = Router.define(App, {
  scrollRestoration: true,
  // all optional:
  getScrollRestorationKey: ({ route, path, key }) => key, // `path` keeps one per URL
  scrollToTopSelectors: ['#main'], // reset on a new entry, rather than kept
  scrollRestorationBehavior: 'instant',
  defaultHashScrollIntoView: { block: 'start' },
});
```

Scroll restoration is TanStack Router's, option for option. Nothing on a
page says anything: the window and every element the user scrolls are kept
per history entry, the way a site of whole pages behaves.

1. **Track.** Every element the user scrolls, and the window, is kept with
   where it is, under the restoration key of the entry drawn: the entry's
   key unless `getScrollRestorationKey` says. An element is named by its
   `data-scroll-restoration-id`, else by its path in the document.
2. **Carry.** On a move to another key, what is still on the page keeps
   where it was: a list beside the post that opens. Never the window, nor
   what `scrollToTopSelectors` names: a container whose content a move
   replaces.
3. **Restore.** As the move lands, with whatever is drawn then, what is
   kept for the key it lands on is put back. With nothing kept for the
   window, a push or replace to a hash scrolls its element into view, else
   the window, and what `scrollToTopSelectors` names, go to the top. Back,
   Forward and a reload find what their entry kept. A replace is a new entry
   in the place of the one shown, with a key of its own, so it goes to the
   top as a push does, unless it says `resetScroll: false`.
4. **Save.** To the tab's session storage when the page is hidden, so a
   reload, and a duplicated tab, start from it. Under Start the page holds
   an inline script that puts it back before the app hydrates, so a reload
   never paints at the top first.

A move says otherwise for itself, as TanStack's do:

- `resetScroll: false`, on `Router.Link`, `Router.push` and `Router.replace`:
  restore nothing and reset nothing, as opening a post below its list on a
  phone, where the window must stay.
- `hash`: the element on the page it goes to, `href` ending `#part-5`.
  `hashScrollIntoView` says how it is scrolled into view; `false` leaves it.

`useElementScrollRestoration({ id } | { getElement })` reads what is kept for
an element, or the window, on the entry drawn: for a virtual list that puts
itself back.

A page that lands still loading may be too short to reach where it was:
what is drawn as the move lands is what is restored, as in TanStack, and a
move held up to 150 ms for its data mostly lands drawn. Nothing scrolls
while the app shows a past Step. Why it follows TanStack is in
[ADR 0036](adr/0036-scroll-restoration-follows-tanstack-router.md).

An app on TanStack Router leaves TanStack's own scroll restoration off for
the route Kabuki is drawn on. An app that animates a page out, as
`AnimatePresence` does, turns the browser's scroll anchoring off around it,
`overflow-anchor: none`, and names the panes that go out and come in, with
`data-scroll-restoration-id`, so the two are never taken for each other.

## One click, a project to one of its tasks

1. `Router.Link` drew `<a href="/projects/4/tasks/a">`. The Router's View catches the plain click and Sends `Pushed`.
2. The project's key did not change, so only the task is new. The Router holds the move and asks for the task's data.
3. It comes in 80ms: the move lands with the task's data `Ready` in the Router's Model, the project keeps its Model and its Workers, and its `pages` follow its Props: the task page is made, handed its data as `status`.
4. With an Adapter, the `write the address` Command pushes the URL; the Router writes the task's Metadata once it is drawn.

## Guards

A guard is what a page draws. The root page draws sign-in in place of its
pages while signed out, and the URL stays what it is while the user signs
in. A Worker that reads `props.route.page` can `replace` a public page with
the dashboard once signed in. Pages exist whatever the root's State, so their
Workers run; a page whose work must wait for a user reads that from a
Capability.

## Not built yet

- Typed ancestor params: a page sees its own params typed, and `route.params` loosely.
- Blocking a move, as over unsaved changes.
- Moving focus on a move, for a screen reader, as scroll is put back.
- Starting a `client` page's data request from the document's head, before the code loads.
- One routed app per page: two Routers on one page would both write the address.
