# @kestack/kabuki

## 0.0.6

### Patch Changes

- [#79](https://github.com/pkishorez/monorepo/pull/79) [`df76ba6`](https://github.com/pkishorez/monorepo/commit/df76ba60280fdb5405ca85b29fe67f8604de18bf) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Router that routes in memory starts at its root, not at whatever page the browser is on, so a routed demo can sit inside another app's page. `Router.view` no longer gives `View.app` an `input` that reads the browser's address: only an app whose Layer holds an Adapter owns the address, and it starts there with `input: () => view.startAt()`. Start's client does this for you; an app that gives `browser()` or `tanstack()` to `View.app` itself adds that line.

- [#138](https://github.com/pkishorez/monorepo/pull/138) [`af1f892`](https://github.com/pkishorez/monorepo/commit/af1f8924c111d3cdc6fa040ecc2982b3836f5fb9) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Message to an Instance with many siblings, or deep in the tree, costs far less. Finding an Instance by its Address walks down once, looking each Child of an `each` up by its key instead of scanning the list, and the Runtime's live tree passes over every Child that did not change. One Message to one of 10,000 siblings went from about 2.9 ms to under 0.1 ms, and one to the bottom of a chain 200 deep from 3.4 ms to 0.25 ms. Nothing else changes.

- [#138](https://github.com/pkishorez/monorepo/pull/138) [`4d4cc1a`](https://github.com/pkishorez/monorepo/commit/4d4cc1a3789e5f5feaf0892b246f04c7caffb983) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A `Router.Link` and a `Router.Retry` are no longer drawn again on every move: they read the Router's Sends alone, which never change. `useRouter` draws again only when what it holds changes: the entries, the move, the move held or the Metadata.

- [#138](https://github.com/pkishorez/monorepo/pull/138) [`a581f08`](https://github.com/pkishorez/monorepo/commit/a581f085ade3a86e985d75b5ec9ba0724bc14ff0) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Kabuki is rebuilt around three parts: the Actor and its Blueprint, the app's data (Address, History, Snapshot), and one Runtime per app, running or stopped, that Seeks any Step and Forks in place. Breaking.

  **Added**

  - `actor.blueprint` and `Blueprint.at`: what an Actor is and does, as plain data, with nothing running: for the top and each State, the Messages it handles, its Workers, Children, Queries and the Capabilities it Provides. Every tool reads it instead of the engine.
  - `Address`: an Instance's one canonical ID, `App/Inside:downloads#2/files[3][#1](https://github.com/pkishorez/monorepo/issues/1)`, now naming the State a Child is written in. `Address.parse`, `parent`, `place`, `within` and `check`; an Address taken from a Snapshot types what can be sent to it.
  - `Snapshot.trail(actor, history, address, upTo?)`: one Instance's story along the History, up to any entry, when it started, each Message sent to it, each that changed it, and when it stopped. Every Instance in a Snapshot carries the History entry that `started` it and the one that last `changed` it.
  - `Snapshot.workers(actor, snapshot, address)`: the Workers the data asks for at an Instance, by name and, for one of `each`, key, by the rule a running Runtime runs them by. Compare it before and after an entry to see which Workers the entry started or stopped.
  - `Runtime.make(actor, { input, history, layer, window })` and `Runtime.scoped` for Effect code: the app's one Runtime, running from the moment it is made, and running none of the Head's Commands. `runtime.running` says whether it runs.
  - `runtime.stop()` stops every Worker, Provide and Command, and Time with it; `runtime.send` then throws `Stopped` and adds nothing. `runtime.start()` runs again at the Head: Workers and Provides start from its data, and no past Command runs again.
  - `runtime.fork(entry | null)`: moves the same Runtime's Head to any entry, or init, so the next Message grows a new Branch. Running, its work starts again from that entry's data, running no Command; stopped, only the Head moves.
  - `runtime.seek(entry | null)`: the app right after any entry, on any Branch, as a `Step`, the plain data `{ entry, at, snapshot }`, changing nothing.
  - `History.tips(history)`: the last entry of every Branch.
  - `<Kabuki of={runtime | step} view={AppView} />`, from `@kestack/kabuki/react`: a Runtime is drawn at its Head and a click Sends while it runs; a Step is drawn as it is and a click does nothing.

  **Changed**

  - `provides` names what it gives: `provides: { capabilities: [Session], layer: (self) => Layer }`. A Layer that builds a Capability not named, or misses one named, is a type error, and only the named ones reach descendants.
  - A slot name is used once per Actor: a State's Child can no longer take the name of one written at the top.
  - History is plain data, `{ input, entries, head }`, with `History.make`, `add`, `go`, `line`, `children`, `entry`, `compact`, `save`, `load` and `restored`; its Window is a Runtime option. A History entry is `{ id, parent, to, message, from, at }`.
  - A Snapshot is `{ entry, root }`, and an Instance's `id` is its `address`; it no longer holds `key`. `Snapshot<A>` and `Instance<A>` are typed by their Actor: `state`, `model` and `props` are its own, and each Child in `children` is its Actor's `Instance`, a list for `each`, optional when written in a State or there only `while` a test holds. So `runtime.snapshot.root.children.files[0].address` is that Child's `Address`, and `runtime.send` takes only its Messages. `Instance` with no Actor stays untyped, for tools, and a typed one is assignable to it.
  - `AppRuntime<A>` (from `useRuntime()`) is assignable to `AppRuntime`, so an Attachment or tool written for any app takes a typed one.
  - `View.app`'s `useRuntime()` gives `runtime`, the same one for the app's whole mount, `seeking`, `seek(entry | null)` (`null`: init, as with `runtime.seek`), `toHead()` (draws the Head again), `fork(entry | null)`, `start`, `stop`, `workers`, `instance`, `failure` and `subscribe`. A Fork no longer makes a new Runtime.
  - `@kestack/kabuki/core/history` and `@kestack/kabuki/core/snapshot` are now `@kestack/kabuki/core/data`.

  **Removed**

  - `Runtime.start` (use `Runtime.make` or `Runtime.scoped`), the `live` option and `runtime.live` (use `runtime.running`, `stop()` and `start()`), `useRuntime()`'s `show`, `shown` and `clear` (use `seek`, `toHead`, `seeking` and `fork(null)`), `runtime.provided`, `Snapshot.handle` and `Snapshot.instanceAt` (use `Snapshot.play` and `Snapshot.at`), the engine's `ActorDefinition` types from the public API, and `actorAt`, `isRestore` and `remember` from `@kestack/kabuki/core/data` (kabuki's own).
  - `@kestack/kabuki/core/command` (import `Command` from `@kestack/kabuki` or `@kestack/kabuki/core/actor`).

- [#138](https://github.com/pkishorez/monorepo/pull/138) [`b72f4e7`](https://github.com/pkishorez/monorepo/commit/b72f4e76332cae07b51d0fbe128fff4b06f6f8a6) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Core is now the Definition, the Snapshot, the Runtime and the History, and the Runtime is a Snapshot kept alive.

  - `Snapshot.init`, `Snapshot.next` (was `play`), `Snapshot.save` and `Snapshot.load` make, step and save the app as plain data. A Snapshot is `{ root, at }`. An Instance repeats its State's tag as `_tag`, so a check on it narrows `state` and `children`, and no longer has `started` or `changed`.
  - `Runtime.make(actor, { snapshot, layer })` runs a Snapshot. `runtime.root` and `runtime.at(address)` give a live Instance to walk and Send through. `runtime.follow(snapshot)` makes the running app match a Snapshot, changing only what differs, or with `restart: true` starts all work again. `runtime.subscribe` tells its listener the entries played.
  - The Runtime keeps no History: `runtime.history`, `fork`, `seek`, `keep`, `window`, `send`, `workers` and `instance` are gone. A History is kept beside a Runtime: `History.init(snapshot)`, `add`, `move`, `entries`, `all`, `snapshot`, `replay`, `compact`, `save` and `load`. An entry is `{ to, message, from, at }`, and a History's entry adds `id` and `parent`.
  - There is no Restore Message. A History starts from a Snapshot, and Compacting moves that start forward. A saved History is `{ start, entries, head }`, so one saved before no longer loads.
  - `Snapshot.replay`, `Snapshot.seek` and `Snapshot.trail` are gone: use `History.snapshot`, `History.replay`, and a filter over `History.entries`.
  - React: `<Kabuki of>` takes a Runtime or a Snapshot. `useRuntime()` gives `history`, `window`, `keep` and `startOver`, which starts the app over from init, and no longer `workers` or `instance`. `Step` is exported from `@kestack/kabuki/react/types`.

- [#138](https://github.com/pkishorez/monorepo/pull/138) [`6f65d9b`](https://github.com/pkishorez/monorepo/commit/6f65d9b14a24b5c8728cdf628df1744cfc31857b) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A static page is drawn at the build, and a page is never drawn earlier than the page above it.

  - **Static pages are files.** `vite build` now draws every URL that ends at a static place and writes its HTML beside the client's files, so the platform answers it without the server. Each static place's answer is kept beside it as the Static Data, one JSON file per place and path under the build id: `/_kabuki/data/<build>/Blog.Post/hello.json`.
  - **The build writes the App Shell and the client pages it can.** `_kabuki/shell.html` is the App Shell, which the server answers `/_kabuki/shell` and every URL under a client root with. A client page under static ones is drawn loading at each path they list, unless its own path names params or it needs a query.
  - **A static place with params lists its paths.** Its Loader is `{ paths, load }`, or `{ paths }` with no data; only a listed path is drawn, and any other is not found. Leaving `paths` out is a type error. A Loader may also be written `{ load }` in any mode.
  - **An unlisted path is a `404`, and a deploy does not break an open tab.** A URL that is all static and reaches the server was not listed. A tab from the build before gets a `410` for its Static Data, and loads through the Loader RPC instead.
  - **A static Loader runs once per build.** In the browser a move to a static place reads its file with a `GET`; the server reads the same file through the platform's new `Host.files` when it draws a dynamic or client page under a static one. On Cloudflare the files come from the Worker's `ASSETS`.
  - **Breaking: a static Loader is handed its path params alone**, never its query. A page whose data depends on the query is `dynamic` or `client`.
  - **Breaking: no page says `render: 'static'`.** An app starts static and a page says only `'dynamic'` or `'client'`; `dynamic` under a client page is a type error on `Router.define`, and an error when the router is made.
  - **A build runs the app.** It builds one more module, for Node, to draw with, so the app's modules must load there: read what only a deploy or a browser has when a Layer is built, never as a module loads.
  - `prerender` is exported from `@kestack/kabuki/start/server`, for tests.

- [#135](https://github.com/pkishorez/monorepo/pull/135) [`7cacf4f`](https://github.com/pkishorez/monorepo/commit/7cacf4f346b81da1732fac049ea01c3fcab9af0c) Thanks [@pkishorez](https://github.com/pkishorez)! - A stopped View keeps what it read of its Children.

  **Changed**

  - A View whose Instance has stopped, still drawn as it leaves the page, keeps what `useChild` and `useChildren` last read of its Children, as it keeps its own last data. A Child its live parent stopped still reads as gone. So a page can stay on screen, whole, until the next one is ready.

- [#138](https://github.com/pkishorez/monorepo/pull/138) [`4dbf438`](https://github.com/pkishorez/monorepo/commit/4dbf43853ebb2eb47879a8bf73139ccf71ac3909) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Kabuki's import paths are cut from 21 to 11: each Part has one path for its values and one for its types. Breaking.

  - `@kestack/kabuki`, `/react`, `/routing` and `/start` give values only. Their types are at `@kestack/kabuki/types`, `/react/types`, `/routing/types` and `/start/types`.
  - `/start/server` and `/start/vite` stay; `/start/client` stays for the browser entry the plugin writes.
  - Removed: `/core/actor`, `/core/data`, `/core/runtime`, `/react/view`, `/routing/page`, `/routing/router`, `/routing/capabilities`, `/routing/adapter`, `/routing/browser`, `/routing/tanstack`, `/start/app`, `/start/platform`, `/start/cloudflare` and `/start/nitro`.
  - `useLive` is on `@kestack/kabuki/react`; `Loading`, `browser`, `tanstack`, `useElementScrollRestoration` and `useKeepScrollAnchor` are on `@kestack/kabuki/routing`.
  - `cloudflare()` and `nitro()` are on `@kestack/kabuki/start/vite`, beside `start`. Their `serve` functions are `serveCloudflare` and `serveNitro` on `@kestack/kabuki/start/server`.

- [#138](https://github.com/pkishorez/monorepo/pull/138) [`3bd9576`](https://github.com/pkishorez/monorepo/commit/3bd9576b80e3364b23826a4e070f81daec56f3c6) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Message wakes only the Views whose Instance it changed. Each View, `useChild` and `useChildren` is told at its own Address, so with thousands of Views a Message costs about what one does: the Snapshot drawn is compared with the one before, skipping every part that is the same object in both, where every View used to look its Instance up from the root on each Message.

- [#133](https://github.com/pkishorez/monorepo/pull/133) [`2678376`](https://github.com/pkishorez/monorepo/commit/2678376efd3ce396d3f491c63c615169112eccd9) Thanks [@pkishorez](https://github.com/pkishorez)! - The service worker now answers every page with the App Shell, without the network, so an installed app opens at once at any URL. It keeps only the build's assets and the App Shell; each page loads its data through the Loader RPC, so server data needs a connection, and a Render Mode only says what the server sends when no worker answers. `navigation.networkTimeoutMs` is gone, and a navigation to a path with a file extension or under `/_kabuki/` goes to the network.

  In Kabuki, the root page's Render Mode is now inherited like any other. Under a `client` root the server answers every URL with the App Shell and a `200`, except a file that is not there, which stays a `404`. `Start.app({ loading })` is what the App Shell paints until the app is drawn, and the App Shell now carries the root's Metadata.

## 0.0.5

### Patch Changes

- [#111](https://github.com/pkishorez/monorepo/pull/111) [`85d0632`](https://github.com/pkishorez/monorepo/commit/85d063272beee88e041d0fb0734af2e0a0ceeb68) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Definitions build their own Actor, Children are a plain object, and Queries are typed. **Breaking.**

  **Breaking**

  - `Actor.build(Auth, { … })` → `Auth.build({ … })`, and `Page.build(…)` → `Items.build({ pages })`. `Actor` is now just `define` and `child`.
  - `children` is a plain object of `Actor.child(…)` slots, each typed by the level it sits in:
    `children: { rows: Actor.child(RowLive, { each, input, props, emits }) }`.
    A hand-written `{ actor }` slot no longer compiles.
  - A Query is declared in `define` and answered in `build`; args and answer are checked against their Schemas:
    `queries: { peers: { args: { room: Schema.String }, result: Schema.Array(Schema.String) } }` in `define`,
    `queries: { peers: (self, { room }) => … }` in `build`.
  - `send` returns what happened to the Message, `'handled' | 'ignored' | 'queued' | 'refused'`, instead of `true` / `false`.
  - `running.query(id, name, args)` is removed: use `instance.queries`.
  - Types in `core/actor`: `ChildOf` → `MakeChild`, `Query` → `Answer`; `Declared` and `DeclaredQueries` are new; `Stopped.query` is optional.

  **New**

  - `instance.until(test)` waits until the Instance's data passes `test`, narrowed to match, and fails with `Stopped` if it stops first.
  - devtools: the Blueprint shows each Query's args and answer.

- [#110](https://github.com/pkishorez/monorepo/pull/110) [`30b99d1`](https://github.com/pkishorez/monorepo/commit/30b99d1a28c00bb614a0a5180d05cb4355720eed) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Child can tell its parent things (Emits), and an Update returns only what changed. **Breaking.**

  **New**

  - `emits` in a definition lists what an Actor may tell its parent. An Update returns `emit`, and the parent turns each into one of its own Messages:
    `Actor.child(LoginLive, { emits: { SignedIn: ({ user }) => ({ _tag: 'LoggedIn', user }) } })`.
    Use it instead of a Capability that exists only so a Child can call back. Each one shows in the History as its own entry.
  - `define` takes a Schema's fields directly: `model: { count: Schema.Number }`, `message: { Added: {}, Removed: { id: Schema.String } }`.

  **Breaking**

  - The Model is always a struct, and an Update's `model` holds only the fields that change: `{ model: { draft: text } }`. When nothing changes, the Model stays the same object and its Views don't redraw.
  - `state: { … }` → `states: { … }`.
  - `Router.app` → `Router.view`: `View.app(Router.view(router, AppView), { layer })`.
  - std-toolkit: `Replicas.child([…])` → `Actor.child(Replicas.actor([…]))`.

- [#113](https://github.com/pkishorez/monorepo/pull/113) [`daadcde`](https://github.com/pkishorez/monorepo/commit/daadcdebc5f79a7a8b92b4edbb31a6083ff3414a) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Lists can restore their own scroll position from an anchor, not just a pixel offset.

  **New**

  - `useKeepScrollAnchor({ id } | { getElement })`, from `routing/router`, saves an anchor (any JSON, such as the top item and its offset) with the current history entry.
  - `useElementScrollRestoration` returns it as `anchor` on Back, Forward and reload. An element with an anchor is left for the list to restore once it has drawn.

  **Fixed**

  - A list that read its saved position before the router knew the history entry got nothing on page load. It now gets it once the entry is known.

- [#107](https://github.com/pkishorez/monorepo/pull/107) [`3e336a0`](https://github.com/pkishorez/monorepo/commit/3e336a09571e36f3934f47935f5864690b959497) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Kabuki's import paths are reorganized. **Breaking.**

  Where things live now:

  | Path                          | Gives                                            |
  | ----------------------------- | ------------------------------------------------ |
  | `@kestack/kabuki`             | `Actor`, `Command`, `History`, `Runtime`         |
  | `@kestack/kabuki/react`       | `View`, `useChild`, `useChildren`                |
  | `@kestack/kabuki/routing`     | `Page`, `Router`, `Navigation`, `useRouter`      |
  | `@kestack/kabuki/start`       | `Start`                                          |
  | `@kestack/kabuki/<layer>/<x>` | one value and all its types, e.g. `core/runtime` |

  **Breaking**

  - `toReact(actor, view, layer, options)` → `View.app(view, { layer, ...options })`. `layer` is optional when nothing is required.
  - Moved: `Stopped` → `core/runtime`, `useLive` → `react/view`, `useElementScrollRestoration` → `routing/router`, `Router.memory` / `Router.cached` → `Loading.memory` / `Loading.cached` in `routing/capabilities`, `handle` / `instanceAt` / `isMany` → `Snapshot.*` in `core/snapshot`.
  - Renamed types: `Page.NotFound` → `NotFoundError`, `Page.Redirect` → `RedirectTo`, `Start.DocumentProps` → `DocumentProps` from `start/app`.
  - Shorter adapter paths: `routing/browser`, `routing/tanstack`, `start/cloudflare`, `start/nitro`.
  - Removed: `Replay`, `outcomeOf`, `init`, `restore`, `isRestore`, `isHistory`, `lazyOf`, `RUN`. Use `history.seek`, `history.snapshotAt` and `history.outcome`.

## 0.0.4

### Patch Changes

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`7bcb8db`](https://github.com/pkishorez/monorepo/commit/7bcb8dbdc934779cae6a86fad96a367c9923e747) Thanks [@kishorenuma](https://github.com/kishorenuma)! - An app whose root needs Input no longer crashes when mounted again.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`7bcb8db`](https://github.com/pkishorez/monorepo/commit/7bcb8dbdc934779cae6a86fad96a367c9923e747) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `toReact` and `Start.app` take `attach`: Attachments that run with the app in a browser. `AppRuntime` gains `subscribe`.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`110f14f`](https://github.com/pkishorez/monorepo/commit/110f14f798dde8057ee65e101325128102968291) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Fork carries on at its Step's own page instead of the address the tab was left on. `Start.app` takes `name`; without it every Start app is called `Router`.

- [#99](https://github.com/pkishorez/monorepo/pull/99) [`ff91379`](https://github.com/pkishorez/monorepo/commit/ff91379bba26c81bad7e4fb0325af31bfe9f9b5f) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Runtime's `provided(id)` lists the Capabilities an Instance provides. A built Actor keeps its Schemas under `schemas`.

## 0.0.3

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - - Kabuki Start serves `/_kabuki/pages` and `/_kabuki/shell` for whatever stands in front of the app, and runs anywhere Nitro does.
  - Breaking: `Start.app({ router, view, document, layer })` and `Start.server(...)` each take one object.
  - Queries ask a live Instance a question; `running.instance()` reaches a running app from outside.
  - Breaking: `Navigation.reload` is a function, `reload({ anew, hold })`.
  - An Actor's type is slim, so deep apps emit declarations; doors export only what is used.

## 0.0.2

### Patch Changes

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`cb8daac`](https://github.com/pkishorez/monorepo/commit/cb8daaca0574b1c80bea06da0435ff4cfbe114d1) Thanks [@pkishorez](https://github.com/pkishorez)! - A Child is written as a Worker is: `children: { rows: { actor: Row, each: ({ model }) => model.ids, input: (_, id) => …, props: ({ model }, id) => … } }`. `invoke` and `Actor.many` are gone: a Child is always there, there `while` a test holds, or one per key `each` names, and its `input` and `props` take the parent's data and its key. A `while` Child is new, and comes back as a fresh Instance; a parent's View types it as a Handle or `undefined`. An outlet's `children` now carries everything, so `invoke: outlet.invoke` is dropped and the outlet is spread beside the Actor's own Children.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`78aa972`](https://github.com/pkishorez/monorepo/commit/78aa972696c33baa0f0ad3521bb454c17537ef4c) Thanks [@pkishorez](https://github.com/pkishorez)! - An Actor is written in two steps that can live apart: `Actor.define(name, { input, props, model, state, message, requires })` says what it is, and `Actor.build(Definition, { init, on, state, children, workers, provides })` how it behaves; `Actor.make(…).build(…)` is gone. A page is the same: `Page.define({ path, params, query, data, render, metadata, pages, model, state, message, requires })` names the definitions of the pages under it, and `Page.build(Definition, { pages, … })` the build of each; `Route.page` is gone. A page is drawn with `View.make`, as any Actor is: `Route.view` is gone, and so is the Place written around each page, so `self.children.X` is the page itself. The Router holds the data of every page on screen and hands each its own as `status`, and every page Requires `Navigation` without saying so. The router is defined from the root page's definition with `Router.define(App, { redirect, notFound, base, delay, preload, preloadDelay, …scroll restoration })`, which imports no build, so a page's build moves the app with `Router.push(router.X())`: the function form of a move is gone. The root page's own `metadata` replaces the tree's. `Router.app(router, AppView)` and `Start.app(router, AppView, { document, layer })` take the router and the View of the root page's build. `Route.notFound()` and `Route.redirect()` are `Page.notFound()` and `Page.redirect()`; `usePending()` is `useRouter().pending`. `View.lazy(Actor, () => import(…))` takes the Actor it draws, so the router preloads a page's code by its build. Every View carries the Actor it draws, and a new Instance in the same place is drawn with fresh React state.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`13fa549`](https://github.com/pkishorez/monorepo/commit/13fa54979520c64fa87ac8ae576a5f6bdb4cd4f6) Thanks [@pkishorez](https://github.com/pkishorez)! - The Router gives every history entry a key no earlier page load gave, and keeps the key an entry already holds: the entry a page opens at after a reload, and one from before it that Back lands on. Before, every page load counted keys from `0` again, so after a reload a new entry could take the key of an old one.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`bf66a56`](https://github.com/pkishorez/monorepo/commit/bf66a566d0c102e1892766f321c93dad264b3b79) Thanks [@pkishorez](https://github.com/pkishorez)! - Every page's `status` has `info`, good to know and never needed to draw: its `render` and `staleTime`, and once `Ready`, where its data came `from` (`server`, `browser` or `cache`), when it `arrivedAt`, when it is `freshUntil`, `null` for a static page, and how long it `took`. The data a server drew the page with is fresh from when the server loaded it. `Router.define(App, { cacheSize })` sets how many copies the Data cache keeps, 50 unless said; Start's browser reads it. The load behind a stale copy joins one already on its way, as a preload's, so a click during a preload of a stale page loads it once.

- [`f2462af`](https://github.com/pkishorez/monorepo/commit/f2462af9b7e78e8a817111cd07a6193a90984560) Thanks [@pkishorez](https://github.com/pkishorez)! - A History can keep a Window: `History.make(actor, { window: 100 })`, `toReact(..., { window: 100 })`, or `history.keep(n)` at any time, even while the app runs. Entries older than the Window Compact into a Restore of the Snapshot right after them; `history.keep(null)` keeps every one again from then on. Saved Histories' ids now rise but may skip, and `history.has(id)` says whether an entry is still there. The Kabuki DevTools Timeline gets a Window field. `toReact` remembers a changed Window in `localStorage` under the app's name, so it outlasts a reload.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`fd94bc0`](https://github.com/pkishorez/monorepo/commit/fd94bc006a15b5960ea67ade3dfb333b1e7b6fce) Thanks [@pkishorez](https://github.com/pkishorez)! - A page is an Actor with a place in the URL: `Route.page({ path, params, query, data, render, metadata, pages, model, state, message, requires }).build(…)`, drawn with `Route.view(Page, …)`, and the Routes are read down from the root page with `Route.tree(() => App)`. Kabuki writes a Place around each page that loads its data and hands it in as `status`, `Loading`, `Failed` or `Ready { data, refreshing }`; a page takes no Input and draws all three itself. Child pages are the page's Children, a page with pages is a place on its own when the URL ends at it, and a parent and its page load side by side. `Route.path`, outlets, pending and failed screens, `Routes.X.props` and `Router.app`'s `failed` and `pending` options are gone. The Router holds a move up to 150ms, then lands with each new page loading. `Router.cached` adds the Data cache, which Start's browser uses: Back, a link to a page seen before and a preload show its copy at once. `Router.Link` preloads on hover, once in view, or never; `Router.preload`, `Router.reload` and `Router.Retry` are new. A move takes a Route or a function that makes one, `Router.push(() => Routes.X())`, so a page's Update can use the Routes it is part of. A single Child can name a `key`, and is made again when it changes. The Loader RPC answers each place on its own line as its Loader is done, and Start draws a page whose Loader broke or found nothing failed, with a `500` or `404`, and a client page loading.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`2ba4537`](https://github.com/pkishorez/monorepo/commit/2ba4537b0ab0f5a22105f62a6c635a6dd64614ef) Thanks [@pkishorez](https://github.com/pkishorez)! - A page an outlet serves can name a `pending` and a `failed` screen. A move still loading after 150ms lands early, so the slot of the place it waits on shows its pending screen, kept for at least 300ms; `Router.app` takes `pending: { delay, minimum }` to change both. A move whose Loaders break no longer does nothing: it lands, marked failed, and the slot shows the page's failed screen, or the one given to `Router.app` as `failed`, which also serves pages drawn by a function; with neither, the page shown stays. `useRouter().failed` says why, and a link to the same Route tries again. An outlet's function now gets each screen as its own page, with `showing` saying which.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`db8d448`](https://github.com/pkishorez/monorepo/commit/db8d448b3f2cef855f704596f2cc5991ced11c14) Thanks [@pkishorez](https://github.com/pkishorez)! - `Page.redirect` takes `{ permanent: true }`, which a server answers with a `308` rather than a `302`, and a whole URL outside the app, `Page.redirect('https://…')`, which a server answers with a `302` to it and the browser leaves for in place of the entry. A Loader's Redirect is typed to a Route of its own router. An Adapter's `leave` takes `{ replace }`. A redirect's URL the browser hears while its Route is already on screen is now replaced in the address. A query no page reads, like `?utm_source=`, is left in the address as it is; each move the app makes writes its Route alone.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`a1037fe`](https://github.com/pkishorez/monorepo/commit/a1037fe03e52badd0eb8d71ac81c87bbf007b5a1) Thanks [@pkishorez](https://github.com/pkishorez)! - Add routing, in `@kestack/kabuki/routing`, a layer core never imports. Write every place once with `Route.tree` and `Route.path`; put `Router.app` above the app's root, and it holds the history, hands the current Route down as Props, and takes every move as one Message. A node with child Routes serves them with its `outlet`. It routes in memory by default; give `browser()` from `@kestack/kabuki/routing/adapter/browser` or `tanstack()` from `@kestack/kabuki/routing/adapter/tanstack` in the Layer to put the address in the URL. `toReact` takes the root's Input as a new `input` option, read once when the app first makes its History, and core exports the types `Actor.make(...).build` is checked with.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`ccb8fde`](https://github.com/pkishorez/monorepo/commit/ccb8fde624c92bb445cf422ba2db719a3f0e4965) Thanks [@pkishorez](https://github.com/pkishorez)! - Scroll restoration, as TanStack Router does it, with its options. `Router.app(Routes, View, { scrollRestoration: true })` keeps the window and every element the user scrolls per history entry: a new entry starts at the top, what stays on the page keeps where it was, and Back, Forward and a reload put it all back as the move lands. A replace is a new entry with a key of its own, so it goes to the top as a push does. `getScrollRestorationKey`, `scrollToTopSelectors`, `scrollRestorationBehavior` and `defaultHashScrollIntoView` tune it; a move says `resetScroll: false` to leave it all as it is, and `hash` with `hashScrollIntoView` to go to an element, on `Router.Link`, `Router.push` and `Router.replace`. An element is named by its `data-scroll-restoration-id`, else its path; `useElementScrollRestoration` reads what is kept for one. Under Start the page holds an inline script that puts scroll back before the app hydrates. The Router keeps each entry's `#hash`. Nothing scrolls while the app shows a past Step: `useLive()`, from `@kestack/kabuki/react`, says whether a View draws the app as it is now.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`3428d71`](https://github.com/pkishorez/monorepo/commit/3428d71ac531333a1da3ec48d3777cbf6b092636) Thanks [@pkishorez](https://github.com/pkishorez)! - The Data cache keeps the data a server drew the page with, as it keeps what the browser loads: Back to the first page shown is at once, with nothing loaded again, and its scroll is put back on a page that is whole. `Loading` takes an optional `keep`, which `Router.cached` fills.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`478ff35`](https://github.com/pkishorez/monorepo/commit/478ff35181a31706a333cd1108f3c0030289ef33) Thanks [@pkishorez](https://github.com/pkishorez)! - A page says how long a copy of its data stays fresh: `Page.define({ staleTime })`, in milliseconds, inherited by the pages under it, and `Router.define(App, { staleTime })` for every dynamic or client page that says none, 0 unless said. A move or a Preload to a page with a fresh copy in the Data cache shows it and loads nothing; an older copy is shown `refreshing` and loaded again behind it, and a Preload loads it again. A static page's data is fresh until the next deploy, so `staleTime` on it is refused. A Reload loads every page on screen whatever its Stale time. `router.every` lists each place's Stale time. A preload of the move the Router holds asks nothing.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`9eca385`](https://github.com/pkishorez/monorepo/commit/9eca385a8763f5c44acff676345c62d825af9c07) Thanks [@pkishorez](https://github.com/pkishorez)! - `Start.useRuntime()` reads the running app from the Document, so a Start app can draw Kabuki's devtools around itself. It is `null` on the server, which runs no app.

- [#66](https://github.com/pkishorez/monorepo/pull/66) [`7be2c3d`](https://github.com/pkishorez/monorepo/commit/7be2c3dc37fe98789be9c67ec6f36c6b66de67bd) Thanks [@pkishorez](https://github.com/pkishorez)! - Add Start, which serves a routed app from a Cloudflare Worker: `@kestack/kabuki/start` gives `Start.app(app, { document, layer })`, the app with its Document and what its Actors Require in the browser, `Start.layers<Env>().instance(…).request(…).visitor(…).loaders(loaders)` from `@kestack/kabuki/start/server`, the Loaders with what they Require on the server in three tiers (made once, made for each request, and made from the request itself for dynamic and client Loaders only), each Layer checked by type against what Requires it, `Start.ResponseHeaders` for a Loader's response headers, and the Document's `<Start.Head />` and `<Start.Scripts />`; `start({ platform: cloudflare() })` from `@kestack/kabuki/start/vite`, with the adapter from `@kestack/kabuki/start/platform/cloudflare`, finds the app's two files by name, `src/app` and, if it is there, `src/loaders.server`, and writes Start's handler, which knows no platform, and the server's and the browser's entries, so it deploys with Alchemy's `Cloudflare.Website.Vite` and no `main`. For a URL the Worker runs the Loaders of the places drawn on the server at once, draws every page from its Input with no Runtime, answers `308`, `302` and `404` as the Routes and Loaders say, keeps pages whose places are all static in the Cloudflare Cache under the build id, and serves the Loaders to the browser at `POST /_kabuki/load`. The browser hydrates from the saved History and preloads the lazy Views the server drew, which the plugin names by their module. `Router.app` now also gives its `routes`; `Route.tags` and `Router.usePending` are gone (use `usePending`); `useRouter<Route>()` and `usePending<Route>()` read the Router's Routes as the app's Route type; and the routing door no longer exports the `Place`, `PlaceSchema`, `Tag`, `Inputs`, `Wanted` and `RouterInput`, `RouterMessage`, `RouterModel` types. A page opened at a place drawn without its Input loads it once. `Start.useDrawn()` reads when and by which build the server drew the page, and whether the component asking was hydrated from it. `Route.tree` takes the root's `metadata` and the not-found Route's (`notFound`). An outlet keys each page, so a new page starts its React state afresh, and draws a client place in the browser alone, never on a server, Input or not. `Routes.place` is the Schema of every place's dotted name, and `Routes.every` and `Routes.places` give each name as that type; a missing Loader's type error names the places that need one. The Router starts loading the code of the lazy Views a move will draw together with its Inputs. In dev an edit to the app is a hot reload that carries on from its History, and under workerd the plugin scans the app's server files so the first page does not reload.

## 0.0.1

### Patch Changes

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - First release. An app as one tree of Actors outside React: each Actor a small state machine driven by Messages, one immutable Snapshot for the whole app, Effect running the work, and React only drawing it.

  - `Actor.make` declares an Actor's Schemas (`input`, `props`, `model`, `message`, `state`) and what it `requires`; `build` gives its behavior at the top and per State: `on` (the Updates), `children`, `invoke`, `provides` and `workers`. `Actor.many` declares keyed Children.
  - `Command.make(name, { args, run })` makes a Command once; an Update asks for it as plain data a test can compare.
  - `History` records every Message as a tree of Branches and replays to any entry. `Runtime.start(history, layer)` runs it. A History saves as plain JSON through the Actors' Schemas, so the encoded side of every Schema must be JSON-safe.
  - `@kestack/kabuki/react`: `toReact` draws the app and hydrates from a saved History, `View.make` draws one Actor, `useChild` and `useChildren` let a parent View read its Children, and `useRuntime()` reports a Runtime that failed to start or move as `failure`.
