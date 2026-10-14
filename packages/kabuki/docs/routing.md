# Routing

`@kestack/kabuki/routing` adds routing to a Kabuki app without changing how
an app is written: Routes are data, the Router is one Actor, and every page is
a plain Actor that is handed its Route as Props. Core never imports it.

## Four parts

```
Your Actors and Views        App, Settings, Billing …           plain Kabuki
outlet                       Routes.Settings.outlet({ … })      writes `children`, `invoke` and a View
Router + Adapter             Router.app(Routes, App)            holds where the app is; talks to the URL
Routes                       Route.tree({ … })                  pure data: Schemas, URL ⇄ Route, Metadata, Inputs
```

### Where the code lives

```
src/routing/
  route/          Routes as data: node.ts (the types, Route.path), values.ts, places.ts,
                  url.ts, metadata.ts, loader.ts, outlet.ts; route.ts makes the tree
  router/         the Router Actor: moves, loading, navigation, outlets, hooks
  adapter/        the port: where the address lives            @kestack/kabuki/routing/adapter
    browser/      the browser's own history                    @kestack/kabuki/routing/adapter/browser
    tanstack/     TanStack Router's history                    @kestack/kabuki/routing/adapter/tanstack
```

`route` is pure data and depends on nothing else here, so Start's shared
code reads it without the Router; `router` uses `route` and `adapter`. Each
adapter lives under the port it fills and is imported from its own subpath,
so an app carries only the one it uses.

### Routes: every place, once

```ts
export const Routes = Route.tree(
  {
    Dashboard: Route.path('/', { metadata: { title: 'Dashboard' } }),
    Settings: Route.path(
      '/settings',
      { metadata: { title: 'Settings' } },
      {
        Overview: Route.path('/'),
        Billing: Route.path('/billing', { metadata: { title: 'Billing' } }),
      },
    ),
    Blog: Route.path(
      '/blog',
      { input: Schema.Array(PostSummary) },
      {
        Index: Route.path('/'),
        Post: Route.path('/:slug', {
          params: { slug: Schema.String },
          input: Post,
          metadata: (_params, post) => ({
            title: post.title,
            description: post.summary,
          }),
        }),
      },
    ),
    Account: Route.path('/account', { render: 'dynamic', input: Viewer }),
  },
  {
    redirect: {
      '/profile': (r) => r.Settings.Overview(),
      '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }),
    },
    metadata: { description: 'Acme, the app' },
    notFound: { title: 'Not found', robots: 'noindex' },
  },
);
```

- `Routes.Settings.Billing()` is a Route value: `{ _tag: 'Settings', page: { _tag: 'Billing' } }`. Params are checked by type: `Routes.Blog.Post({ slug: 'hello' })`.
- `Routes.read(url)` and `Routes.path(route)` turn a URL into a Route and back. A URL that names no place reads as `NotFound`; a malformed one too. A redirect's path can hold params, handed to it as strings.
- `Routes.Settings.props` is the Schema of what the Settings Actor is handed: its params and query, `page`, the child that is current, and `inputs`, the Inputs of the places below it. `Routes.props` is the root's: `{ page, inputs }`.
- A place is named by its tags from the root, dotted: `Blog.Post`.

#### Metadata

`metadata` is a value, or worked out from the place's own params and query
and its Input. The deepest place that says a field wins, field by field, Open
Graph's too: title, description, canonical, `openGraph`, `robots`, and more
`meta` and `link` tags as written. `Routes.metadata(route or url, inputs)` is
pure, so a server can call it; a place whose Metadata needs its Input says
nothing until it has one. The tree's `metadata` is the root's, under every
place's, and `notFound` is the not-found Route's, over the root's.

#### Inputs and Render Modes

`input`, a Schema, says a place needs a Loader before it is drawn.
`Routes.Blog.Post.input` is that Schema, which the page's Actor takes as its
own Input. `render` is `static`, the default, `dynamic` or `client`, and the
places below inherit it; a place can only be drawn later than its parent, so
a static place under a dynamic one is a type error, and an error when the
Routes are made.

`Routes.places(route)` lists the places on a Route's path, from the root down,
each with its dotted name, every param down to it, its Render Mode and its
Input's Schema. `Routes.every` lists every place of the tree as Schemas, which
is what a Loader RPC is made from. `Routes.place` is the Schema of every
place's dotted name, so a part of a page that takes one is checked by type:

```ts
export type Place = typeof Routes.place.Type; // 'Blog' | 'Blog.Index' | 'Blog.Post' | …
```

#### Loaders

```ts
export default Routes.loaders({
  Blog: () => Posts.list(),
  'Blog.Post': ({ slug }) => Posts.get(slug),
  Account: (_params, request) => Auth.viewer(request),
});
```

`Routes.loaders` is a typing helper and runs nothing: one function per place
with an Input, by its dotted name, and no other. A static place's Loader is
given its params, its own and its ancestors'; a dynamic or client place's,
the request too. Each returns its Input, or fails with `Route.notFound()` or
`Route.redirect(route)`. Missing, extra or wrong-typed is a type error, and
the error names the places: `these places have an Input and no Loader:
"Blog.Post" | …`, or `is not a place with an Input: "Home"`. Both
failures are Schema classes, `Route.NotFound` and `Route.Redirect`, so they
travel over the wire.

### The Router: one Actor above the app

`Router.app(Routes, App)` is an Actor like any other. Its Model is the history,
`entries` and `at`, each entry a Route with the Inputs of its places by dotted
name, the last `move`, and the `pending` move it waits on. Its one Child is
your App, whose Props are `{ page, inputs }` of `entries[at]`. Every move is
one Message to it:

| Message      | Sent by                                                      |
| ------------ | ------------------------------------------------------------ |
| `Pushed`     | a click on a `Router.Link`, or `Router.push`                 |
| `Replaced`   | `Router.replace`                                             |
| `Went`       | `Router.back` and `Router.forward`, `useRouter`              |
| `WentBackTo` | `Router.backTo`                                              |
| `Arrived`    | the Adapter: Back, Forward, a typed URL, a fresh load        |
| `Loaded`     | the `load` Worker, with the Inputs a pending move waits on   |
| `Failed`     | the `load` Worker, when a Loader says not found or Redirects |

It Provides `Navigation`, so a page that moves the app from an Update lists
`Navigation` in its Requires and returns `Router.push(route)` as a Command.

### Loading: a move that needs Inputs

A move to a Route whose places need Inputs the entry shown does not hold
waits: the page shown stays drawn, the move is kept in the Model as
`pending`, and a Worker loads what is missing through the `Loading`
Capability, all at once. A place whose key, its name and every param down to
it, did not change keeps its Input. On the answer the move lands, pushed or
replaced. A newer move stops the Worker and drops its answer, by id. Not found
lands on the not-found Route; a Redirect is followed in place of the move, so
Back never returns to it. Back and Forward reuse the Inputs each entry holds.
The code of every lazy View serving a place on the pending Route starts
loading with its Inputs, so it is never a second wait after them.

`usePending()` gives the pending move, `{ to, how }`, for a progress bar;
`useRouter().pending` too. Both read any Route as `{ _tag: string }`; name the
app's Route to read it as one of its Routes:

```ts
type Route = typeof Routes.route.Type;
const pending = usePending<Route>();
const href = pending && Routes.path(pending.to);
```

`Router.memory(Routes, loaders)` is a `Loading` that runs the Loaders in place,
for tests and stories. With no `Loading` in the Layer a move lands at once,
and a place with an Input is not drawn until it has one.

`Root.startAt(url, inputs)` is the Router's Input at a URL with the Inputs its
places already have, purely: what a server draws from. Places it has no Input
for are pending from init, so once the Runtime starts they load as after a
click. `Root.href(route)` writes a Route as a URL, under the base, and
`Root.routes` is the Routes it serves: what [Start](start.md) reads.

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
its Route is written, is replaced. `startAt` reads the URL once, so the app is
drawn at the right page from the first frame.

Commands never run during Time Travel, so the address stays live: a past
Step is a drawing, and the move that led there is one Message on the Timeline.

### Outlets: the pages under a place

```ts
const sections = Routes.Settings.outlet({ Overview, Billing });

export const SettingsActor = Actor.make('Settings', { props: Routes.Settings.props })
  .build({ children: sections.children, invoke: sections.invoke });

export const SettingsView = View.make(SettingsActor, (self) => (
  <section>
    <Tabs />
    <sections.View of={self} />
  </section>
));
```

`outlet` writes nothing you could not write yourself:

- `children`: one keyed slot per child Route, `{ Overview: Actor.many(Overview.actor), … }`.
- `invoke`: from the Props' `page`, the current child's slot holds one Instance, keyed by its params, handed its value as Props and its place's Input from the Props' `inputs` as its Input; the others are empty. A place with an Input is empty until it has one. A new param is a fresh page; a new query is the same page with new Props.
- `View`: draws whichever Instance is there. A child served by a function instead of an Actor is drawn by it, from its Props and Input. Each page is keyed, so a new one starts its React state afresh. A client place is drawn only once the browser draws on its own: a server, and the hydration of what it drew, leave it empty, Input or not.

A child that has nothing of its own, like a blog's index, which is the
blog's list, is drawn by the parent's View from its own Model, which it
started from its Input. Its outlet entry draws nothing, and the View reads
which child is current from its Props:

```tsx
const posts = Routes.Blog.outlet({ Index: () => null, Post });

const BlogView = View.make(BlogActor, (self) =>
  self.props.page._tag === 'Index' ? (
    <PostList posts={self.model.posts} />
  ) : (
    <posts.View of={self} />
  ),
);
```

Kabuki works the rest out: when Settings' Props change, its keyed Children
follow them, in the same Message.

## One click, Overview to Billing

1. `Router.Link` drew `<a href="/settings/billing">`. The Router's View catches the plain click and Sends `Pushed`.
2. The Router's entries grow by one. The App's Props are now `{ page: Settings › Billing }`.
3. The App's outlet keeps Settings: its key did not change. Settings is handed `{ page: { _tag: 'Billing' } }`; its outlet stops Overview and starts Billing. Anything Settings runs keeps running.
4. With an Adapter, the `write the address` Command pushes `/settings/billing`.

## Guards

A guard is where an Actor sits. Put the pages' outlet in the State that
allows them, `SignedIn`, and they cannot exist without a user; the URL stays
what it is while the user signs in. A page for some users only is the same:
its slot is filled only when the Props or Model allow it.

## Animating pages

An outlet's View takes a function of the page and the move at its level, so
a page can be wrapped in an animation library's component:

```tsx
<AnimatePresence custom={move} mode="popLayout">
  <sections.View of={self}>
    {(page, move) =>
      page && (
        <motion.div
          key={page.key}
          custom={move}
          variants={slide}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {page.element}
        </motion.div>
      )
    }
  </sections.View>
</AnimatePresence>
```

A leaving page's Actor has already stopped; its View keeps drawing its last
data while it animates out.

## Metadata in the document

With an Adapter, the Router writes the Metadata of the entry shown to the
document after every move: the title, and every tag marked `data-kabuki`,
which replace the ones marked before; tags nobody marked are left alone. A
TanStack route can call `Routes.metadata(url)` in its own `head`. In memory
the document is never touched. A View never writes Metadata: what needs data
is worked out from the place's Input.

## Not built yet

- Blocking a move, as over unsaved changes.
- Scroll restoration per history entry.
- One routed app per page: two Routers on one page would both write the address.
