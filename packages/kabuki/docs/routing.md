# Routing

`@kestack/kabuki/routing` adds routing to a Kabuki app without changing how
an app is written: a page is an Actor with a place in the URL, the Router is
one Actor above them, and a page's data is handed to it as Props. Core never
imports it. Why it is built this way is in
[ADR 0035](adr/0035-a-page-is-an-actor-and-its-place-loads-its-data.md).

## Four parts

```
Your pages and Views         Route.page, Route.view            plain Kabuki Actors
Places                       written by Route.page             load each page's data, hand it in as `status`
Router + Adapter             Router.app(Routes, AppView)       holds where the app is; talks to the URL
Routes                       Route.tree(() => App)             read down from the pages: Schemas, URL ⇄ Route, Metadata
```

### Where the code lives

```
src/routing/
  route/          Routes as data: node.ts (the types), values.ts, places.ts, url.ts,
                  metadata.ts, loader.ts; route.ts makes the Routes from the pages
  capability/     what the Router and Places use: Loading, the Data cache, Navigation
  page/           Route.page, the Place it writes, Route.view, Route.tree
  router/         the Router Actor: moves, links, hooks, the Metadata in the document
  adapter/        the port: where the address lives            @kestack/kabuki/routing/adapter
    browser/      the browser's own history                    @kestack/kabuki/routing/adapter/browser
    tanstack/     TanStack Router's history                    @kestack/kabuki/routing/adapter/tanstack
```

`route` is pure data and depends on nothing else here, so Start's shared code
reads it without the Router. `page` uses `route` and `capability`; `router`
uses all three and `adapter`.

## A page

```tsx
export const Task = Route.page({
  path: '/tasks/:task',
  params: { task: Schema.String },
  data: TaskData,
  metadata: ({ task }, data) => ({ title: data?.title ?? `Task ${task}` }),
  requires: [Navigation],
  model: Schema.Struct({ draft: Schema.NullOr(Schema.String) }),
  state: Schema.TaggedUnion({ Reading: {}, Editing: {} }),
  message: Schema.TaggedUnion({
    Edit: {},
    Typed: { text: Schema.String },
    Saved: {},
  }),
}).build({
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

export const TaskView = Route.view(Task, ({ props }) => {
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

`Route.page` is `Actor.make` with a place in the URL, and every field is
optional: `path`, `params`, `query`, `data` (its Loader's Schema), `render`,
`metadata` and `pages`, then the Actor's own `requires`, `model`, `state` and
`message`. `build` takes how it behaves, at the top and per State, as any
Actor's does. A page takes no Input: it exists before its data. It is handed
Props:

- `params` and `query`: its own, typed from its Schemas.
- `status`, if it has `data`: `Loading`, `Failed { reason, notFound }`, or
  `Ready { data, refreshing }`. `refreshing` is true while the data loads
  again behind what is shown. Its View draws all three with a `switch`, and
  its Updates read it as Props: to keep an editable copy, an Update copies it
  into the Model.
- `route`: where it sits. `route.name` is its dotted name; `route.page` is the Route one level down, if the
  URL goes on; `route.params` every path param down to it, its ancestors'
  too, typed loosely; the root's `route.notFound` is the path of a URL that
  names no page.

`Route.view(Task, draw)` draws the page from its own data, and is the View
of the Place around it, which is what the page above holds.
`Route.view(Task, View.lazy(() => import('./task-view')))` loads its code
when first drawn, or when a move to it or a preload starts; that module
default-exports `View.make(Task.actor, …)`.

### Pages under a page

```tsx
export const Project = Route.page({
  path: '/projects/:id',
  params: { id: Schema.FiniteFromString },
  data: ProjectData,
  pages: { Task, Files },
}).build({});

export const ProjectView = Route.view(Project, (self) => (
  <section>
    <ProjectHeader status={self.props.status} />
    {self.children.Task && <TaskView instance={self.children.Task} />}
    {self.children.Files && <FilesView instance={self.children.Files} />}
    {!self.props.route.page && <Overview />}
  </section>
));
```

Each key of `pages` names a page under it, and is its name: `Project.Task`.
Kabuki adds one Child per page, by its key, beside the page's own: there
while the URL names it, and made again when its params change, so new params
are a new page with fresh state, and a new query is the same page. A page
with pages is a place on its own when the URL ends at it, so there is no
index page: the parent draws what it shows there. A parent decides where and
whether its pages are drawn, and can draw one whatever its own status: a
parent and its page load side by side.

### Routes: read down from the root

```ts
export const App = Route.page({ pages: { Home, Blog, Projects } }).build({});

export const Routes = Route.tree(() => App, {
  redirect: { '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) },
  metadata: { description: 'Acme, the app' },
  notFound: { title: 'Not found', robots: 'noindex' },
  preload: 'intent',
  preloadDelay: 50,
});
```

The root page has no path and no data. `Route.tree` walks its `pages` down:

- `Routes.Projects.Task({ id: 4, task: 'a' })` is a Route value, `{ _tag:
'Projects', id: 4, page: { _tag: 'Task', task: 'a' } }`; `Routes.Projects({
id: 4 })` ends at the project. Params are checked by type.
- `Routes.read(url)` and `Routes.path(route)` turn a URL into a Route and
  back. A URL that names no place, or a param that does not read, is
  `NotFound`. A redirect's path can hold params, handed to it as strings.
- `Routes.paths()` prints every place's path as written from the root. Two
  places at one path are refused when the Routes are made.
- `Routes.places(route)` lists the places on a Route's path, each with its
  dotted name, its key, what its Loader is handed and its Render Mode;
  `Routes.every` lists every place as Schemas, which is what a Loader RPC is
  made from; `Routes.place` is the Schema of every dotted name.

`Route.tree(() => App)` reads the root when the Routes are first used, so a
page can import the Routes for its Updates, as long as nothing reads them
while the modules load. `Route.tree(App)` reads it at once.

#### Moving from an Update

A page's type is part of the Routes', so a page that moves the app hands the
Router a function that makes the Route, not the Route:

```ts
Saved: () => ({ command: Router.push(() => Routes.Projects({ id: 4 })) }),
```

What the function does is checked; only what it returns is typed loosely,
so the page's type never waits on the Routes'. A Route value at hand, as from
Props, is handed as it is. Every move takes either: `push`, `replace`,
`backTo`, `preload`, and `Navigation`'s Requests in a Worker.

#### Metadata

`metadata` is a value, or worked out from the page's params and query and its
data, `undefined` until it is there. The deepest place that says a field
wins, field by field, Open Graph's too. `Routes.metadata(route or url,
data)` is pure, so a server can call it. In the browser the Router writes it
again when a page's data comes, not only on a move.

#### Data and Render Modes

`data`, a Schema, says a page needs a Loader. `render` is `static`, the
default, `dynamic` or `client`, inherited by the pages under it; any mode may
sit under any other. A server draws a page's data for `static` and `dynamic`;
a `client` page, and every page under it, is sent loading, and the browser
loads it.

#### Loaders

```ts
export default Routes.loaders({
  Projects: ({ id }) => Db.project(id),
  'Projects.Task': ({ id, task }) => Db.task(id, task),
  Search: ({ q }, request) => Search.run(q, request),
});
```

`Routes.loaders` is a typing helper and runs nothing: one function per place
with data, by its dotted name, and no other. A Loader is handed every path
param down to it and its own query; a dynamic or client place's, the request
too. Each returns its data, or fails with `Route.notFound()` or
`Route.redirect(route)`; a defect breaks its page alone. Missing, extra or
wrong-typed is a type error that names the places. A child that needs its
parent's data calls the same service; a request-scoped Layer makes it run
once.

## The Place: a page's data

Kabuki writes one Actor around each page, its Place, never written by a user.
Its Model is the page's `status`; its one Child is the page.

- **Starts** from what is known as it is made: the data the Router loaded
  before the move landed, the server's, or the Data cache's copy. Knowing
  nothing, `Loading`.
- **Loads** with a Worker, while Loading, or due: after a reload, on a copy
  the Data cache kept, or when its query changes. The data shown stays
  meanwhile, `refreshing`. A loading screen stays at least 300ms, so it never
  flashes.
- **Fails** its own page alone: `Failed`, not found or broken. Loading again
  behind data shown keeps the data when it fails.
- **Redirects**: a Loader's Redirect replaces the entry.

Its Messages are `Loaded`, `Failed` and `Redirected`, each on the Timeline.

## The Router: one Actor above the app

`Router.app(Routes, AppView)` is an Actor like any other. Its Model is the
history, `entries` and `at`, each entry a Route, the last `move`, the
`pending` move it holds, and what the last move's pages start from. Its one
Child is the root page's Place. Every move is one Message to it:

| Message      | Sent by                                                           |
| ------------ | ----------------------------------------------------------------- |
| `Pushed`     | a click on a `Router.Link`, or `Router.push`                      |
| `Replaced`   | `Router.replace`                                                  |
| `Went`       | `Router.back` and `Router.forward`, `useRouter`                   |
| `WentBackTo` | `Router.backTo`                                                   |
| `Arrived`    | the Adapter: Back, Forward, a typed URL, a fresh load             |
| `Loaded`     | the `load` Worker, with what the held move's new pages start from |
| `Redirected` | the `load` Worker, when a Loader Redirects                        |
| `Waited`     | the `wait` Worker, when the move has waited its delay             |
| `Reloaded`   | `Router.reload`, `Router.Retry`, a link to the page shown         |
| `Preloading` | a `Router.Link` that preloads, or `Router.preload`                |

It Provides `Navigation`, so a page that moves the app lists it in its
Requires and returns `Router.push(…)` as a Command.

### A move, held up to 150ms

A move to pages whose data is not on screen is held: the page shown stays,
`usePending()` says where it goes, and a Worker asks `Loading` for the new
pages' data. If it comes within the delay, or the Data cache has it, the move
lands with each new Place `Ready`, and no loading screen shows. Past the
delay the move lands anyway, and each new Place shows it is loading and
loads its own; a Place joins the load the Router started. Pages whose key,
name and path params, did not change are kept, with their state. A newer
move drops an older answer. `Router.app(Routes, AppView, { delay })` changes
the 150ms.

### The Data cache

`Router.cached(Routes, loading)` puts the Data cache in front of a `Loading`;
Start's browser has one. It keeps the last data of each place, one copy per
name and what its Loader is handed, the newest, up to 50, the least recently
used dropped first; a failure is never kept. A move to a page with a copy,
Back, Forward or a plain link, starts it `Ready` at once: a static page as it
is, a dynamic or client one `refreshing`, loaded again behind it. A place
being loaded is joined, never asked for twice. Places asked for in the same
moment are one request, each answered as it comes.

### Reload and retry

`Router.reload()`, a Command, `useRouter().reload()`, or `<Router.Retry>`, a
button, loads every page on screen again: their data stays shown,
`refreshing`, and the pages, their Models and States, are kept. A failed
page goes back to loading. Every other copy in the Data cache is dropped. A
link to the page shown does the same.

### Preload

`<Router.Link to={…} preload="intent" | "viewport" | false preloadDelay={…}>`
asks the Router to preload where it goes: on hover, focus or touch after the
delay, 50ms; once the link scrolls into view; or never. `'intent'` unless the
link or the Routes say. Each ask is a `Preloading` Message; the Router's
Command warms the Data cache and the code of the lazy Views on that Route,
and nothing comes back. `Router.preload(route)` does the same from an
Update. A move during a preload joins it.

### The Adapter: where the address lives

With no Adapter in the Layer, the app routes in memory: Back and Forward are
`Went` Messages and the URL is never touched. That is the default, so a test
or a story runs the real router.

```ts
toReact(Root.actor, Root.view, Layer.mergeAll(AppLive, tanstack()), {
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
Step is a drawing. Nothing fetches either: each page's data is in its
Place's Model, and a fetched answer is in the Message that brought it.

## One click, a project to one of its tasks

1. `Router.Link` drew `<a href="/projects/4/tasks/a">`. The Router's View catches the plain click and Sends `Pushed`.
2. The project's key did not change, so only the task is new. The Router holds the move and asks for the task's data.
3. It comes in 80ms: the move lands, the project keeps its Place, its Model and its Workers, and its `pages` follow its Props: the task's Place is made `Ready`, and the task page with it.
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
- Scroll restoration per history entry.
- Devtools folding each Place into its page.
- Starting a `client` page's data request from the document's head, before the code loads.
- One routed app per page: two Routers on one page would both write the address.
