# Plan: routing as Actors (Kabuki Start)

A handoff for a new session. It records what was decided, why, and what was
tried and dropped, so the work can start without the original discussion.

Status: **built** on `feat/kabuki-routing`: the library, Start, the example
app `apps/kabuki-start` and the docs demo. How it works now is
[routing.md](routing.md) and
[ADR 0035](adr/0035-a-page-is-an-actor-and-its-place-loads-its-data.md);
this plan stays as the record of how the design was reached. The "Route
Actor" below was named the Place when it was built.

A visual walkthrough of the final model sits beside this file:
[plan-walkthrough.html](plan-walkthrough.html). Open it in a browser. It steps
through eleven Messages and shows the screen, every Actor and its Workers.

## Goal

Kabuki Start should have the smallest possible set of ideas. A new feature
is an add-on to ideas a user already knows, never a new kind of thing.

Scope: **authoring web pages** — drawing them, loading their data, loading
and error screens, refresh. Not APIs. Mutations, API endpoints, OAuth and
webhooks belong to the RPC toolkit (`toolkits/rpc-toolkit`) or a future
framework. Kabuki Start never grows server functions or API routes.

## The core ideas, unchanged

These stay exactly as they are. The routing design must fit them, not bend
them.

- **Input**: given once, when an Actor is made; `init` reads it. Never read again.
- **Model**: the Actor's own data.
- **State**: which mood it is in; Messages, children and Workers can be per State.
- **Message**: the only thing that changes Model or State.
- **Props**: read-only data from the direct parent, always fresh. Update and
  View see it. Not saved in the History; worked out again from the parent.
- **Children**: Actors the parent says exist, from its Model, State and Props.
- **Worker**: runs **while its Condition holds** (read from the Model) and
  sends **any number of Messages** while it runs. Stopped by changing the Model.
- **Command**: fire and forget; sends **at most one** Message.
- **View**: draws one Instance from its data. Nothing else.
- **History / Snapshot / time travel**: the History is the Messages; a
  fetched result lives inside its Message. Replay never fetches. Time travel
  only draws. Restarting from a Snapshot starts every Worker whose Condition
  holds, so a fetch in flight runs again.

## The final routing model

### Three new words

- **Router**: the top Actor. Its Model is the URL and the history for
  Back/Forward (URLs only). It decides which Route Actors exist: one per
  level of the URL, keyed by name + params. It does **not** track loading.
- **Data cache**: the last data each route loaded, one copy per
  name + params (+ query, if its Loader reads it). Newest wins. Not per
  history entry: Back, Forward and a plain click all read the same copy.
  Capped, least recently used dropped first.
- **Route** (`Route.page`): `Actor.make` plus `path`, `params`, `query`,
  `data` (the Loader's Schema), `render` (`static` | `dynamic` | `client`),
  `metadata`, `pages` (child routes). All optional. Everything else is a
  normal Actor: model, state, message, requires, and all of `build`.
- **Loader**: a server function that returns a route's data. Lives in
  `loaders.server.ts`, keyed by dotted place name, as today.

### Each route is a pair of Actors

```
Router                                   url, back/forward
└─ App page                              yours: root page, no path, no data
   └─ Route: Team        Model: load      Kabuki's: loads, refreshes, retries
      └─ Team page       Props: params, load   yours: a normal Actor
         └─ Route: Project
            └─ Project page
```

**Route Actor** — Kabuki's, generated from `Route.page`, never written by a user:

- **Model**: `load: Loading | Failed { reason } | Ready { data, refreshing }`.
- **Input**: what is already known at the start — the server's data on
  first load, or the Data cache's copy. With data it starts
  `Ready`; without, `Loading`. Input is right here: it really is
  "what I know at the start".
- **Worker `load`**: runs while `Loading` or `refreshing`; sends `Loaded`
  or `Failed`. Workers that start in the same tick are batched into one
  `/_kabuki/load` request (Effect request batching).
- **Messages**: `Loaded`, `Failed`, `Reload`, `Retry`.
- **Its one child is the user's page**, handed `{ params, load }` as Props.

**Page** — the user's Actor:

- **Props**: `params` (own + ancestors') and `load` (the union above).
- **No Input.** The page exists before its data, so there is nothing to give it.
- Its own Model, States, Messages, children, Workers: anything, fully.
- To keep an editable copy, an Update reads Props (Updates see Props with
  every Message): `Edit: (_, { props }) => … props.load.data …`.
- Child routes (`pages: { Task }`) are added to its children by Kabuki.
  Its View places them like any child:
  `{self.children.Task && <TaskView instance={self.children.Task} />}`.
- Its View draws loading, error and data from `props.load` with a `switch`.
  That is drawing Props, nothing special.

### Example

```tsx
export const Task = Route.page('Task', {
  path: '/tasks/:task',
  params: { task: Schema.String },
  data: TaskData,
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
      props.load._tag === 'Ready'
        ? {
            model: { draft: props.load.data.notes },
            state: { _tag: 'Editing' },
          }
        : {},
    Typed: ({ text }) => ({ model: { draft: text } }),
    Saved: () => ({ state: { _tag: 'Reading' }, command: Router.reload() }),
  },
});

export const TaskView = View.make(Task, (self) => {
  const load = self.props.load;
  switch (load._tag) {
    case 'Loading':
      return <TaskSkeleton />;
    case 'Failed':
      return <Failed reason={load.reason} />;
    case 'Ready':
      return (
        <>
          {load.refreshing && <Spinner />}
          <h3>{load.data.title}</h3>
        </>
      );
  }
});

export const Project = Route.page('Project', {
  path: '/projects/:id',
  params: { id: Schema.String },
  data: ProjectData,
  pages: { Task },
}).build();

export const App = Route.page('App', { pages: { Team } }).build();
export const Routes = Route.tree(App); // Router, typed links, URL map
export default Start.app(Routes, AppView);
```

`loaders.server.ts` is unchanged from today:
`Start.layers<Env>()….loaders(Routes.loaders({ 'Team.Project.Task': … }))`.

### Behaviour

| Situation                                   | What happens                                                                                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click to a new route                        | Router waits up to 150 ms; if data arrives, the Route Actor starts `Ready` (no skeleton). Otherwise the move lands, the Route Actor starts `Loading`, the page draws its skeleton. A skeleton stays at least 300 ms. |
| Parent and child both need data             | Both Route Actors exist at once; both Workers run in parallel. The child is drawn when the parent page's View places it (in its `Ready` branch). No waterfall.                                                       |
| Same route, new params                      | New key → new Route Actor + page; everything under it stops.                                                                                                                                                         |
| Same route, same params                     | Kept, with its state.                                                                                                                                                                                                |
| Refresh (`Router.reload()`)                 | Route Actor → `Ready { refreshing: true }`; Worker fetches; old data stays; page gets new Props. The page is **not** recreated; its Model (a draft) survives.                                                        |
| Loader fails                                | Route Actor → `Failed`; page draws it. Retry = a link to the same address (or `Retry` Message) → `Loading`.                                                                                                          |
| Not found / redirect                        | Loader fails with `Route.notFound()` / `Route.redirect(…)` as today: 404/302 on the server, a move in the browser.                                                                                                   |
| Server, `static`/`dynamic`                  | Start runs Loaders first and passes data as each Route Actor's Input → `Ready` → complete HTML.                                                                                                                      |
| Server, `client`                            | Route Actor starts `Loading` → the page's skeleton is in the HTML.                                                                                                                                                   |
| Back/Forward, or any move to a cached route | The Data cache's copy is the Input → starts `Ready { refreshing: true }` at once; the Worker refetches behind it.                                                                                                    |
| Time travel                                 | Draws the Snapshot; each Route Actor's `load` is in it. Nothing fetches.                                                                                                                                             |
| Restart from a Snapshot                     | Every Route Actor that is `Loading` or `refreshing` starts its Worker again.                                                                                                                                         |

## How we got here: decisions and rejected ideas

In order. Each rejected idea is recorded so it is not re-proposed.

1. **No HTML streaming.** TanStack streams deferred data. Rejected for
   simplicity. Status codes must be known before bytes are sent, and
   "static shell + client data" already gives fast first paint.
2. **No server functions or API routes in Start.** RPC toolkit covers them.
3. **Outlet (`Routes.X.outlet({...})` + `children`/`invoke`/`<outlet.View>`)
   — replaced.** Clunky: every parent wires its children by hand.
4. **`Routes.X.page({ view, loading })` + flat pages map + `<Outlet />`
   — rejected.** New vocabulary; a second way to compose besides children.
5. **Route Actor extended by the user (`Routes.X.actor.extend`) with
   States `Loading/Ready/Failed` — rejected.** It takes the user's State
   slot and needs a registry so types find the extension.
6. **`loading`/`failed` options on `View.make` — rejected.** Loading is
   not a property of a View.
7. **React Suspense + error boundary (`<Catch>`) — rejected.** Suspense
   needs a thrown promise; Kabuki's "waiting" is a fact in a Snapshot.
   Inventing promises breaks "a View draws the Snapshot".
8. **"Late Input" in core (`invoke` with `load` instead of `input`) —
   rejected.** Unneeded: a Worker + Message already does this.
9. **Router holds all loading state; parent draws child's loading via a
   `next` Prop — rejected.** `next` was awkward (one per level, the parent
   drew the child's skeleton) and the page could not exist while loading.
10. **Page data as Input — rejected.** The page exists before its data;
    Input is read once. Data that changes belongs in Props.
11. **Final: a Route Actor wraps each page** (the user's proposal). Loading
    lives in a Kabuki Actor next to the page; the page gets `load` as one
    union Prop; pages take no Input. All of it is ordinary Kabuki.

Also agreed along the way:

- Static under dynamic should be **allowed**; the only rule left is
  "nothing inside a `client` route is drawn by the server".
- A child needing its parent's data: **share, don't chain**. Both Loaders
  call the same service; a request-scoped cache (the `request` Layer tier)
  makes it run once. No parent→child data API for now.
- Start the `client` data request **from an inline `<head>` script**,
  before the JS loads, and hand the answer to the Route Actors.

## Decisions from the second session

These override the text above where they differ. Rename at implementation.

- **Names**: Kabuki's wrapper Actor is the **Place** (not "Route Actor");
  the user's Actor is the **Page**; the Prop is **`status`**
  (`Loading | Failed | Ready { data, refreshing }`), not `load`. "Route"
  keeps its glossary meaning: the parsed URL value. The builder stays
  `Route.page`. Glossary gains Place, Page, Data cache, Preload; Outlet goes.
- **`pages` is built on ADR 0034**: each child route is an `each` Child of
  the Page, keyed by its params.
- **Data cache lives in the `Loading` capability**, as an in-memory wrapper
  in `src/routing/router/`, outside the Snapshot. Data enters the app only
  as Messages (a hit comes back at once as `Loaded`), so replay stays exact.
  Memory only; the server's first data seeds it; it does not survive F5.
- **Refetch on a hit**: never for `static` places; always (in the
  background, `refreshing: true`) for `dynamic` and `client`. Cap 50, least
  recently used dropped first.
- **`Router.reload()`**: every Place on screen refetches, old data shown;
  every other cache entry is dropped. A narrower form can come later.
- **The cache** holds in-flight requests too (a click during a preload
  joins it); failures are not kept. It lives only inside the browser's
  `Loading` Layer, made once when the app starts; the server has none.
- **Preload is in this plan, as a Message**: a `Preload { route }` Request
  through Navigation; the Router's Update leaves its Model alone and returns
  a Command that warms the cache (data and view code). Nothing comes back.
  Visible on the Timeline; replay never fetches. Skips a key already cached
  or in flight.
- **Link options**: `preload: 'intent' | 'viewport' | false` and
  `preloadDelay`; app default `'intent'` / 50 ms, set in
  `Route.tree(App, { preload, preloadDelay })`. `'intent'` = hover, focus or
  touch start after the delay. `'viewport'` = once, when scrolled into view.
  Also `navigation.preload(route)` from code.
- **A place's name is written once**: its key in the parent's `pages`.
  `Route.page({ … })` takes no name. The same Page under two parents is two
  places with two Loaders.

### Round 4

- **A keyed `while` Child in core**: `{ actor, while, key: (data) => string }`
  is one Child or none, made again when its key changes. A child route is
  one: `self.children.Task` is a Handle or `undefined`.
- **Pending and Failed screens go**: a Page draws its own `status`. The
  timing stays: the Router holds a move 150 ms; a Place holds `Loaded` until
  `Loading` has shown 300 ms.
- **No app-wide failed fallback**: `status` is a union, so every Page
  handles `Failed`. Kabuki ships a small `<Failed reason retry />`.
- **Not found**: an unknown URL → the root Page gets a `notFound` Prop. A
  Loader's `Route.notFound()` → that Place is `Failed { NotFound }`; the
  server answers 404.
- **Query**: a place declares the `query` fields its Loader reads; a change
  in them refetches with `refreshing: true` (same Place, same Page). The
  cache key includes them. Other query changes only change Props.
- **Metadata**: `metadata(route, data | undefined)`; written again when
  data arrives.
- **Import cycles**: accepted; `Routes` is read only in Views and Updates.
- **First build**: Place, `Route.page`/`Route.tree`, Data cache, preload,
  reload, batching; port `apps/kabuki-start`, the `apps/docs` routing demos
  and devtools fixtures. Later: devtools folding Places, the `<head>`
  request for `client` pages, preload History growth.

### Found while building

- **A move takes a function that makes the Route.** The Routes' type is
  worked out from the pages, so an Update that returns
  `Router.push(Routes.X())` types the page from itself and TypeScript gives
  up. `Router.push(() => Routes.X())` is typed `() => any`, which TypeScript
  never works out while typing the page; the body is still checked.
- **`Route.tree(() => App)` reads the root once first used**, so the pages
  can import the Routes without a module-order crash.
- **The Loader RPC answers each place on its own line.** One request with
  one answer made a quick page wait for the slowest; now each is answered as
  its Loader is done, still one request.
- **The Data cache asks `Loading.each`**, which answers places as they come,
  and the memory `Loading` does the same.
- **Pages without data** have no `status` Prop; their Place is always
  `Ready`, its data `null`.
- **A server draws a client page loading**, not empty, and a failed page with
  a `404` or `500`, the pages above it drawn.

## Costs and open questions

1. **Twice the Actors in the tree.** Devtools should fold Route Actors
   into their page.
2. **Batching** Route Actor fetches into one request needs Effect request
   batching through the `Loading` service.
3. **Types**: deriving each page's Props (`params` incl. ancestors, `load`
   with the right `data` type) and children (child routes + own children,
   no name clashes) from `Route.page` bottom-up. The biggest job.
4. **Routes without `data`**: is `load` absent, or always `Ready`? Lean: absent.
5. **The URL map is spread across page files** (each page writes its own
   `path`; parents import children). `Routes.paths()` should print it and
   startup should reject clashes.
6. **Imports**: pages that link to other pages need `Routes`, which imports
   every page — a cycle. Fine in Views (used at render time); avoid in
   module-level code.
7. **Reload granularity**: `Router.reload()` = this page's Route Actor? all
   on the URL? Probably a place name argument, default "the caller's route".
8. **Data cache** — replaces today's per-entry Inputs in the Router Model.
   Per-entry was rejected: one URL could hold several stale copies, and a
   plain click could not reuse it. Open: where it lives, its cap, and
   whether a cached hit always refetches.
9. **150 ms wait vs a Route Actor that already exists**: the Router must
   delay creating the new pair, prefetch, and hand the result as Input.
   Today's pending-move logic (`router/router.tsx`) is the starting point.

## Backlog from the TanStack / Foldkit comparisons

Page-authoring gaps only, most important first:

1. Reload/invalidate after an RPC save — **covered by this plan**.
2. Each route appears as its data arrives — **natural in this plan**.
3. Scroll restoration per history entry (`docs/routing.md` "Not built yet").
4. Early data request from `<head>` for `client` routes.
5. Error handling beyond Loader failures (render errors are a bare 500).
6. Preload on hover / link in view — **moved into this plan**.
7. Blocking a move (unsaved changes).
8. Catch-all segments (`/docs/*`) — Foldkit has `rest`.
9. Strictly typed `Router.Link to` / `push` (today any `{ _tag: string }`).
10. Caching static answers of `/_kabuki/load`; time-based refresh of
    static pages.
11. A second platform adapter (Node) to prove the platform port.

## Implementation outline

Rough order. Each step should keep the example app and tests green.

1. **ADR**: "A route is a Route Actor and a page" — supersedes the page
   parts of ADR 0030 (pages start from Loader Input) and amends ADR 0013 for
   pages (no Input; loaded data is Props). Next number: 0035.
2. **Route Actor**: a generic Actor builder in `src/routing/` from a place's
   Schemas: `load` Model, `load` Worker over `Loading`, `Loaded`/`Failed`/
   `Reload`/`Retry`, Input = known data, one child = the page.
3. **`Route.page`**: wraps `Actor.make`, adds route fields; `pages` turns
   into a Child per child route, of `each` key its params give. Replaces
   `Route.path` + outlet in `src/routing/route/` (`node.ts`, `outlet.ts`)
   and `src/routing/router/outlet.tsx`.
4. **`Route.tree(App)`**: builds the URL map, typed constructors, `loaders`
   typing, metadata, from the root page. Keep `routes.read/path/places/every`
   so Start's server side keeps working.
5. **Router**: keeps URL/history/pending timing; drops per-entry Inputs;
   stops tracking per-place loading; creates Route Actors with the Data
   cache's copy as Input.
6. **Start**: server builds the Snapshot with Route Actors started `Ready`
   (static/dynamic) or `Loading` (client). Loader RPC stays; add batching.
7. **Example app** (`apps/kabuki-start`): port to `Route.page`; one page
   with its own States to prove it.
8. **Docs**: rewrite `docs/routing.md`, `docs/start.md`, `CONTEXT.md`
   (Route, Route Actor, Page, `load`), README tables. Follow
   `docs/readme-conventions.md` for READMEs.
9. **Changeset**: `patch` (packages are on 0.x, breaking included).

## Where things are today

- Routing: `src/routing/route/` (`node.ts`, `values.ts`, `places.ts`,
  `url.ts`, `metadata.ts`, `loader.ts`, `outlet.ts`), `src/routing/router/`
  (`router.tsx`, `outlet.tsx`, `loading.ts`, `plan.ts`, `navigation.ts`,
  `context.tsx`), `src/routing/adapter/` (memory, browser, tanstack).
- Start: `src/start/` (`server/`, `client/`, `vite/`, `platform/cloudflare/`).
- Example app: `apps/kabuki-start/src/` (`shared/routes.ts`,
  `server/loaders.server.ts`, `client/app.tsx`, `client/pages/blog/`).
- Relevant ADRs: 0013 (child owns data after Input), 0022 (Props),
  0027 (parent controls children through data), 0030 (server draws pages
  from Loaders), 0031–0033 (Layers, tiers, platform).
- Foldkit clone used for comparison: `/tmp/fk/main` (may be gone).
