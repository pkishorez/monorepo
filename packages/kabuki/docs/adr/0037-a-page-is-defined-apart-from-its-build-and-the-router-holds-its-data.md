# A page is defined apart from its build, and the Router holds its data

Supersedes the parts of [ADR 0035](0035-a-page-is-an-actor-and-its-place-loads-its-data.md) where each page's Place loads its data and a move takes a function that makes its Route. An Actor was made in one chain, `Actor.make(name, { … }).build({ … })`, and a page the same way, `Route.page({ … }).build({ … })`, drawn with `Route.view`. The Routes were read down from the built pages, so a page's type was part of the Routes' type, and a page that moved the app could only hand the Router a function that made the Route, typed loosely. Kabuki wrote a Place around each page that held its data and loaded it, so the tree had two Actors per page.

Now everything is made in two steps. A definition says what a thing is: `Actor.define(name, { requires, input, props, model, state, message })`, and `Page.define({ path, params, query, data, render, metadata, pages, … })`, whose `pages` are the definitions of the pages under it. A definition runs nothing and imports only other definitions. A build says how it behaves: `Actor.build(Counter, { init, on, … })`, and `Page.build(Post, { pages: { Comments: CommentsLive }, init, on })`, whose `pages` are the builds of the pages under it. The definition is named `Post`, its build `PostLive`, in one file. Every View is core's `View.make(build, draw)`, a page's too, and carries its Actor; `View.lazy(build, () => import(…))` names the Actor first.

The router is defined from definitions alone: `Router.define(App, { redirect, notFound, base, delay, preload, preloadDelay, … })`, with the root page's own `metadata` in place of the tree's. It imports no build, so any build can import it: `Router.push(router.Projects({ id: 4 }))` is typed in full, and the function form is gone. A module holding a page's definition and its build that imports the router reads the root lazily, `Router.define(() => App)`. `Router.app(router, AppView)` and `Start.app(router, AppView, { … })` take the View of the root page's build, and refuse a View of anything else.

The Place is removed. The Router holds the data of every place on screen in its own Model, by dotted name, loads it with one Worker run per place whose data is due, and hands each page its own as `status`, down through the pages above it. Each page is one Actor: `self.children.Post` is the post page, named after its key. Every page has `Navigation`. Core knows nothing of pages: `Page.build` lives in routing and makes each page under it a Child of the page, with `Actor.build`.

## Considered Options

- **Keep `Actor.make(…).build(…)` and build the router from built pages**: rejected. The router's type waits on every build, so a build that moves the app cannot name a Route by type without a cycle in the types; the function form only hid that.
- **Builds name their child builds, definitions name nothing**: rejected. The router is read down from definitions, so a definition must name the definitions under it; the build then names the build of each, checked against them.
- **Pages known to core**: rejected. Core would know URLs and data; `Page.build` adds the page Children with `Actor.build`, as a user could.
- **Keep the Place, defined and built by Kabuki**: rejected. Twice the Actors in the tree, a name to look a page up by that is not its own, and a `status` that comes from outside the page either way. The Router already knows every place on screen and holds the moves that load them.
- **A route-level View helper, `Route.view`**: rejected. With no Place to draw, a page is drawn as any Actor is, and one way to draw is enough.

## Consequences

- One Actor per page; devtools and tests find a page by its key, `'Post'`, and the root as `App`.
- The Router's Model holds every page's data, and its Timeline shows `PlaceLoaded`, `PlaceFailed` and `PlaceRedirected` Messages Sent to it.
- A page with pages always needs a build naming each child's build, even with no behavior of its own.
- Moving the app is `Router.push(router.X())`; a module cycle between a page and the router is solved by `Router.define(() => App)`.
- `usePending()` is gone: `useRouter().pending` reads the held move.
