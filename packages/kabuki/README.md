# @kestack/kabuki

An app as one tree of Actors outside React: each Actor a small state machine driven by Messages, one immutable Snapshot for the whole app, Effect running the work, and React only drawing it.

## Big picture

Kabuki is the Elm architecture, as [Foldkit](https://github.com/foldkit/foldkit)
builds it on Effect, organized as a tree of Actors and drawn by React. Each
Actor is a state machine and an actor at once: Messages are the only way it
changes, and its State decides which Children it Invokes, which Capabilities
it Provides to them and which Workers run. Leaving a State stops all of it.
Any fact in the Model can own a Worker too: an upload runs for as long as its
row says Uploading.
Children are written the way Workers are: always, `while` a test holds, or
one per key `each` names, so a list of items can be a list of Actors.
It is declarative, as React is: a parent says what should be, never what to
do. It controls its Children only by whether they exist and by their Props,
it hears from them only what they Emit, each turned into one of its own
Messages, and what it must control it owns, as React lifts state up.

The whole app is one immutable Snapshot, and handling a Message is a pure
function from one Snapshot to the next. There is one mailbox, and a Message is
handled before `send` returns. Around that pure core, everything that touches
the outside world is Effect: each Instance's work lives in nested Scopes, and
only the work where a Message landed is stopped or started. An Actor's own
code reaches only the Capabilities it Requires. What its Children need bubbles
up until an ancestor Provides it, and the app does not compile until its Layer
covers the rest.

Core has three parts. The Actor says what can happen, and its Blueprint is
that as plain data, for any tool to read; nothing runs. The data is what
happened and what is: Addresses, the History and Snapshots, plain values
with pure functions, and playing a History entry is the only thing that
changes them. The Runtime makes it run: one per app, a History and the
Snapshot at its Head, running from the moment it is made. Every Message Sent
becomes a History entry, is played at once and runs its Commands, and the
Workers and Provides the Snapshot asks for run. Stopped, all of that stops
and a Send is refused; started again, the work starts from the Head's data
and no past Command runs. The History is a tree of entries, like git
commits. The Runtime Seeks any Step, on any Branch, as plain data, while it
stays where it is, and Forks in place: its Head moves to any entry and the
next Message grows a new Branch. A History is also what an app is saved as
and drawn from before it runs: on a server, at build time, and across a hot
reload.

Routing is a Part on top, in `@kestack/kabuki/routing`, that core never
imports: a page is an Actor with a place in the URL. The router is read down
from the pages' definitions, so any build can import it and name a Route by
type. One Router Actor above the pages holds the history and the data of
every page on screen, and hands each page its own as Props, so a page move
is one Message and a page is a Child coming and going. It routes in memory
by default; the browser's history and TanStack Router's are Adapters,
`browser()` and `tanstack()`. How it fits together is in
[docs/routing.md](./docs/routing.md).

Start, in `@kestack/kabuki/start` and its Vite plugin, serves a routed app
from a Cloudflare Worker: for a URL it runs the Loaders of the places it
names at once, starts every page from what its Loader gave, and sends the HTML with the
Snapshot beside it, which the browser hydrates and carries on from. It never
runs a Runtime on the server. An app writes three files: its pages, its app
with its Document and what it needs in the browser, and its Loaders with what
they need on the server, as a Layer made once and one made per visitor; the
plugin writes every entry. Each
platform is an adapter the app names in its Vite config: Cloudflare Workers, or through
Nitro any host it has a preset for, Node, Bun, Vercel and AWS Lambda among them. For what stands in
front of the app, such as a service worker, Start serves its Pages, each with
how its first drawing is made, and its App Shell, which the browser draws the
app in at its own URL; it knows nothing of what uses them. How it works is in
[docs/start.md](./docs/start.md).

Kabuki is four Parts, each its own subpath and each using only the Parts
below it: core, `@kestack/kabuki`, defines and runs Actors and knows no
React; `@kestack/kabuki/react` draws them; `@kestack/kabuki/routing` gives
pages a place in the URL; `@kestack/kabuki/start` serves a routed app. An
app takes as many as it needs, from the bottom up. A Part's path gives
only the values an app is made of: `Actor`, `Blueprint`, `Command`,
`Address`, `History`, `Snapshot`, `Runtime` and `Stopped`;
`Kabuki`, `View`, `useChild`, `useChildren` and `useLive`; `Page`,
`Router`, `useRouter`, `Navigation`, `Loading`, `browser`, `tanstack`,
`useElementScrollRestoration` and `useKeepScrollAnchor`; `Start`.
Its types are apart, at the Part's `/types` path, for code that has to name
one: `import type { Entry } from '@kestack/kabuki/types'`. Start has two
more paths for what runs on one side only, `/start/server` and
`/start/vite`. Why is [ADR 0047](./docs/adr/0047-values-and-types-have-separate-paths.md).

Read the language in [CONTEXT.md](./CONTEXT.md), the decisions in
[docs/adr/](./docs/adr/), and how the History works in
[docs/history.md](./docs/history.md). A live demo, Opening an app, is at `/demos/opening-an-app` in the docs app: every concept in one story, drawn as the tree.

## Install

```sh
pnpm add @kestack/kabuki effect react
```

- `effect`: Schemas describe Inputs, Models, States and Messages, and every
  one is checked against its Schema as it is made; Workers, Commands and
  Capabilities are Effect values and Layers.
- `react`: `@kestack/kabuki/react` draws the tree with React components.
- `react-dom`, optional: Start draws pages with `react-dom/server` and hydrates them with `react-dom/client`.
- `vite`, optional: `@kestack/kabuki/start/vite` is a Vite plugin.

## Exports

### `@kestack/kabuki`

| Export             | What it does                                                                                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Actor.define`     | Says what an Actor is: its name, Requires, Schemas, what it Emits and the Queries it answers, each with what it is asked with and answers; each Schema may be written as its fields or its cases. It runs nothing.                                         |
| `definition.build` | Says how a defined Actor behaves, at the top and under `states` in one block per State: its rules, Children, Workers, Provides and answers to its Queries. The build is what runs and is drawn, and its `blueprint` is what it is and does, as plain data. |
| `Actor.child`      | Makes one Child in a level's `children`: its Actor, then always, `while` a test holds, or one per key `each` names, with what it is handed and what the parent hears; every function in it is typed by the level it is written in.                         |
| `Blueprint.at`     | Finds the Blueprint at a place in the tree the root's Blueprint can grow, as `App/Inside:downloads/files`.                                                                                                                                                 |
| `Command.make`     | Defines a Command from its name, the Schema of its args and the Effect it runs; an Update calls it with the args.                                                                                                                                          |
| `Address.parse`    | Reads an Address into its root and its segments: the State, slot, key and count of each Child on the way.                                                                                                                                                  |
| `Address.parent`   | Gives the Address of an Instance's parent, or nothing for the root.                                                                                                                                                                                        |
| `Address.place`    | Gives an Instance's place in the root's Blueprint: its Address without keys and counts.                                                                                                                                                                    |
| `Address.within`   | Says whether an Address is another one or below it.                                                                                                                                                                                                        |
| `Address.check`    | Turns text written by hand into an Address of the root's tree, if the root's Blueprint has a Child at every segment.                                                                                                                                       |
| `History.make`     | A new, empty History, right after init, with the root's Input.                                                                                                                                                                                             |
| `History.add`      | Writes an entry after the Head and moves the Head to it; after an entry that already has one, it grows a new Branch.                                                                                                                                       |
| `History.go`       | Moves the Head to any entry, or to init, so the next one grows from there.                                                                                                                                                                                 |
| `History.entry`    | Finds the entry with an id, if the History still has it.                                                                                                                                                                                                   |
| `History.line`     | Gives the entries from the first to any one, the Head by default.                                                                                                                                                                                          |
| `History.children` | Gives the entries that follow an entry, or init, oldest first.                                                                                                                                                                                             |
| `History.tips`     | Gives the last entry of every Branch, the ones nothing follows yet, oldest first: with `entry(h, id).parent` and `children`, how a tool walks the History.                                                                                                 |
| `History.compact`  | Keeps only a Window on the Head's Branch: the oldest entry kept becomes a Restore of the Snapshot right after it.                                                                                                                                          |
| `History.restored` | The lightest History an app can be saved as: one Restore of a Snapshot at a Time, right after init.                                                                                                                                                        |
| `History.save`     | The History as plain JSON, every value as its Schema's encoded side.                                                                                                                                                                                       |
| `History.load`     | A History saved before, read with the Actor's code as it is now; what no longer fits warns, or fails at once with `onMismatch: 'fail'`.                                                                                                                    |
| `Snapshot.init`    | The app right after init, from the root's Input.                                                                                                                                                                                                           |
| `Snapshot.play`    | Plays one more entry on a Snapshot, purely: the next Snapshot, whether it was handled, ignored or dropped, the Commands asked for and what was Emitted.                                                                                                    |
| `Snapshot.replay`  | The Snapshot right after any entry of a History, the Head by default, from the Messages alone.                                                                                                                                                             |
| `Snapshot.seek`    | The same as an Effect that yields to the page as it plays, so a long History never freezes it.                                                                                                                                                             |
| `Snapshot.at`      | Finds the Instance at an Address in a Snapshot, with everything under it.                                                                                                                                                                                  |
| `Snapshot.trail`   | One Instance's Trail up to any entry, the History's Head by default: when it started, each entry Sent to it or that changed it, and when it stopped.                                                                                                       |
| `Snapshot.workers` | The Workers the data asks for at an Instance, from the Snapshot and the root's Actor alone: each by its name, and its key for one of `each`, as a running Runtime runs them there.                                                                         |
| `Snapshot.isMany`  | Tells the list of an `each` Child from one Instance in an Instance's Children.                                                                                                                                                                             |
| `Runtime.make`     | Makes the app's one Runtime of an Actor with the app's Layer, running from the moment it is made, on a new History unless given one, keeping 100 entries unless `window` says.                                                                             |
| `Runtime.scoped`   | The same for Effect code: on its clock, and let go when its Scope closes.                                                                                                                                                                                  |
| `runtime.running`  | Whether the Runtime runs: its Workers, Provides and Commands, and the Messages Sent to it.                                                                                                                                                                 |
| `runtime.send`     | Hands a Message to any Instance, from outside unless said: a History entry after the Head, played at once, its Commands run; says what became of it. Throws `Stopped` while the Runtime is stopped.                                                        |
| `runtime.stop`     | Stops every Worker, Provide and Command, and Time with it; a Send is refused until it starts again.                                                                                                                                                        |
| `runtime.start`    | Runs again at the Head: the Workers and Provides its data asks for start. No past Command runs again.                                                                                                                                                      |
| `runtime.fork`     | Moves the same Runtime's Head to any entry, or init, so the next Message grows a new Branch. Running, its work starts again from that entry's data, running no Command; stopped, only the Head moves.                                                      |
| `runtime.seek`     | The app right after any entry, on any Branch, or init, as a Step: plain data, `{ entry, at, snapshot }`, which changes nothing.                                                                                                                            |
| `runtime.instance` | The root Instance, typed and live, for code outside the tree: reads any Instance's data, Children and Workers, asks its Queries, Sends to it under a name and learns what became of the Message, and waits `until` its data passes a test.                 |
| `runtime.changes`  | The Snapshot at the Head as an Effect Stream: now, then whenever the app settles; a slow reader gets only the latest.                                                                                                                                      |
| `runtime.keep`     | Sets the Window, how many entries the History keeps; older ones Compact into a Restore. Works running or stopped.                                                                                                                                          |
| `Stopped`          | What `runtime.send` throws while the Runtime is stopped, adding nothing; and what a Query asked from outside the tree, or an `until` waiting on an Instance, fails with once the Instance has stopped or the Runtime is stopped.                           |

### `@kestack/kabuki/react`

| Export         | What it does                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Kabuki`       | Draws a Runtime or a Step with the root's View, `<Kabuki of={runtime} view={AppView} />`: a Runtime at its Head, what its Views Send going to it while it runs; a Step, `runtime.seek(id)`, as it is, what its Views Send dropped.                                                                                                                                                 |
| `View.make`    | Defines how one built Actor is drawn, one function for every State, as a React component that takes the Instance, and a `ref` and `style`, from its parent; the View carries its Actor as `.actor`.                                                                                                                                                                                |
| `View.app`     | Turns the root's View, with the Layer that gives what the tree Requires, into one React component that makes and owns the app's one Runtime, made at the first mount; `useRuntime` gives that Runtime and the Step it Seeks, Seeks any Step, Forks, and stops and starts it, always on the same Runtime. Drawn before it runs, on a server too, from a saved History if given one. |
| `View.lazy`    | A View of the Actor it is given first, whose code is loaded the first time it is drawn, or on `preload()`; a server waits for it before it sends, and tells the App's `onLazyView`.                                                                                                                                                                                                |
| `View.preload` | Loads the lazy Views made with these ids, so a browser hydrating a page a server drew never waits on their code.                                                                                                                                                                                                                                                                   |
| `useChild`     | Reads one Child's Model, State and Props from its parent's View, to draw, or only what an optional selector picks; it can never Send.                                                                                                                                                                                                                                              |
| `useChildren`  | Reads the Instances of an `each` Child the same way, in order; only the component that calls it re-renders, as they change or as what the selector picks does.                                                                                                                                                                                                                     |
| `useLive`      | Says whether the app is drawn as it is now, not at a past Step, so an effect that touches the page around it, like its scroll, can stay still under Time Travel; always outside an app, never on a server.                                                                                                                                                                         |

### `@kestack/kabuki/routing`

| Export                        | What it does                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Page.define`                 | Says what a page is: an Actor definition with a place in the URL, its params, query, data, Render Mode, Metadata, the definitions of the pages under it, and its own Schemas and Queries.                                                                                                                                                                                         |
| `page.build`                  | Says how a page behaves, as an Actor's `build` takes it, with the build of each page under it in `pages`; a page is drawn with `View.make`.                                                                                                                                                                                                                                       |
| `Page.notFound`               | What a Loader fails with when its place is not found.                                                                                                                                                                                                                                                                                                                             |
| `Page.redirect`               | What a Loader fails with to send the app to another of its Routes, or to a whole URL outside it; `{ permanent: true }` makes a server answer `308` rather than `302`.                                                                                                                                                                                                             |
| `Page.NotFound`               | The Schema of a Loader's not-found failure, to carry it over the wire.                                                                                                                                                                                                                                                                                                            |
| `Page.Redirect`               | The Schema of a Loader's Redirect, to carry it over the wire.                                                                                                                                                                                                                                                                                                                     |
| `Page.wholeQuery`             | A query field holding the whole query as written, every pair of it, a repeated or undeclared one too: for a page whose query is someone else's to say, as a signed request. Written back whole, the page's other fields over it.                                                                                                                                                  |
| `Router.define`               | Reads the app's router down from the root page's definition: a constructor per place, the URL both ways, each place's Metadata and Render Mode, every path, the typing of the Loaders, and how the Router behaves in the browser, such as how long a move waits for its data, `delay` (150 ms), and how long a loading screen stays at least once drawn, `minimum` (300 ms).      |
| `Router.view`                 | Puts the Router above the root page's View: it holds the history, every move and every page's data. It gives the Router's View, which `View.app` starts at its root, in memory, with `startAt` and `href`; an app on an Adapter starts it at the URL with `input: () => view.startAt()`. With `scrollRestoration: true` on the router it restores scroll as TanStack Router does. |
| `Router.Link`                 | Draws a plain `<a href>` to a Route, preloading it on hover, once in view, or never, going to an element on the page with `hash`, and leaving every scroll as it is with `resetScroll={false}`; the Router catches a plain click and moves the app.                                                                                                                               |
| `Router.Retry`                | A button that loads every page on screen again, for a page whose Loader broke.                                                                                                                                                                                                                                                                                                    |
| `Router.push`                 | A Command that moves the app to a Route, as a new entry.                                                                                                                                                                                                                                                                                                                          |
| `Router.replace`              | A Command that puts a Route in place of the current entry, so Back skips it.                                                                                                                                                                                                                                                                                                      |
| `Router.back`                 | A Command that goes Back.                                                                                                                                                                                                                                                                                                                                                         |
| `Router.forward`              | A Command that goes Forward.                                                                                                                                                                                                                                                                                                                                                      |
| `Router.backTo`               | A Command that goes Back when the app came from a Route, and replaces the entry with it otherwise: closing a dialog with a Route of its own.                                                                                                                                                                                                                                      |
| `Router.reload`               | A Command that loads every page on screen again, as after a save; the pages and their Models stay. `Router.reload({ anew: true })`, when what the data belongs to changed, as the signed-in account: the data shown goes, held and then loading as on a move; with `hold: true`, held until the new data comes, the Command ending once it lands.                                 |
| `Router.preload`              | A Command that warms the Data cache, and the code of the lazy Views, for a Route.                                                                                                                                                                                                                                                                                                 |
| `browser`                     | A Layer that puts the app's URL in the browser's own history, for an app that owns the whole site or everything under its base; with no such Layer the app routes in memory.                                                                                                                                                                                                      |
| `tanstack`                    | A Layer that puts the app's URL in TanStack Router's history, for an app on a TanStack Start catch-all route; TanStack gets back every URL outside the base.                                                                                                                                                                                                                      |
| `useElementScrollRestoration` | Reads where an element, or the window, was scrolled on the entry drawn, and the anchor it kept, as scroll restoration kept it: for a virtual list that puts itself back.                                                                                                                                                                                                          |
| `useKeepScrollAnchor`         | Keeps where a list that puts itself back is, in its own terms, under the entry drawn; scroll restoration then leaves that list to put itself back.                                                                                                                                                                                                                                |
| `Navigation`                  | The Capability the Router Provides to every page, which an Actor under a page that moves the app lists in its Requires.                                                                                                                                                                                                                                                           |
| `useRouter`                   | Reads the Router from a component drawn inside the app: the current Route and URL, the history, the move it holds while it loads as `pending`, the title, Back, Forward, reload and preload; `useRouter<Route>()` types its Routes as the app's.                                                                                                                                  |
| `Loading`                     | The Capability the Router uses, if the Layer has it, to load the data of places.                                                                                                                                                                                                                                                                                                  |
| `Loading.memory`              | A `Loading` that runs the Loaders in place, for tests, stories and the server.                                                                                                                                                                                                                                                                                                    |
| `Loading.cached`              | Puts the Data cache in front of a `Loading`: the last data of each place, shown at once on Back, a link or a preload.                                                                                                                                                                                                                                                             |

### `@kestack/kabuki/start`

| Export             | What it does                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Start.app`        | Takes the app's router, its root page's View, its Document, what the Actors Require in the browser, checked against them, its `name` there, and what to `attach` there: what `src/app` default-exports. |
| `Start.Document`   | The plainest Document, Start's parts in an English page: what an app that gives none is drawn in.                                                                                                       |
| `Start.Head`       | Draws, in the Document's `<head>`, the charset and viewport (its own with `viewport`), the Metadata, and the styles and chunks the page needs.                                                          |
| `Start.Scripts`    | Draws, at the end of the Document's `<body>`, the saved History as JSON and the script that hydrates the page.                                                                                          |
| `Start.useDrawn`   | Reads when and by which build the server drew the page, and whether the component asking was in that drawing or drawn later by the browser.                                                             |
| `Start.useRuntime` | Reads the app's `AppRuntime` from the Document, as `useRuntime` gives it, for devtools drawn around it; `null` on the server.                                                                           |
| `Start.pages`      | Where the server answers the Pages as JSON (`Pages`, from `@kestack/kabuki/start/types`): the build, where the App Shell is, and every page with its path, whether it has params, and its Render Mode.  |

### `@kestack/kabuki/start/vite`

| Export       | What it does                                                                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`      | The Vite plugin: builds for the platform its adapter names, finds the app's two files by name, writes Start's handler, the server's and the browser's entries, names every lazy View by its module, and serves SSR in dev; works under Alchemy's `Website.Vite`. |
| `cloudflare` | Cloudflare Workers, for `start({ platform: cloudflare() })`: the server built as one module in its edge form, handed the Worker's env and the Cloudflare Cache.                                                                                                  |
| `nitro`      | Any Nitro preset, for `start({ platform: nitro({ preset: 'vercel' }) })` beside Nitro's own plain `nitro()` plugin, which it hands the preset; Nitro builds the server for the host and serves the assets.                                                       |

### `@kestack/kabuki/start/server`

| Export                          | What it does                                                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handler`                       | Makes Start's handler, which knows no platform, from what the app's two files export: what the plugin's handler module runs; an app calls it only in a test.                                                                                    |
| `Start.server`                  | Takes Loaders that Require nothing alone, or first what they Require on the server, a `layer` made once and a `visitor` made per request, then the Loaders with `.loaders(…)`, checked against both: what `src/loaders.server` default-exports. |
| `Start.env`                     | Reads the platform's env, typed as the app says it is, from `Start.Env`.                                                                                                                                                                        |
| `Start.Env`                     | The service holding the platform's env for this request: a Worker's bindings, or the process's.                                                                                                                                                 |
| `Start.Request`                 | The service holding the request being answered, for the visitor and the dynamic and client Loaders only.                                                                                                                                        |
| `Start.ResponseHeaders`         | The service a dynamic or client Loader, or the visitor, adds headers to its response with, as a refreshed session's `set-cookie`.                                                                                                               |
| `serveCloudflare`, `serveNitro` | Start's handler as the platform's server entry: what the entry the plugin writes default-exports; an app never calls them.                                                                                                                      |

### Types

Each Part's types are at its own `/types` path, in types only, for code that
has to name one; the paths above give values alone.

| Path                            | Types                                                                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kestack/kabuki/types`         | `Self`, `Single`, `ActorType`, `AnyActor`, `DefinedOf`, `BlueprintLevel`, `Entry`, `From`, `SavedHistory`, `Instance`, `Moment`, `WantedWorker`, `Step`, `LiveInstance`, `Needs`, `RuntimeOptions`, `Sent`, `WorkerStatus` |
| `@kestack/kabuki/react/types`   | `ViewProps`, `ViewOf`, `Handle`, `ChildData`, `Root`, `AppRuntime`, `Attachment`, `KabukiProps`                                                                                                                            |
| `@kestack/kabuki/routing/types` | `Metadata`, `Status`, `Preload`, `MoveOptions`, `ReloadOptions`, `RouterOptions`                                                                                                                                           |
| `@kestack/kabuki/start/types`   | `DocumentProps`, `Drawn`, `StartApp`, `Pages`, `PageInfo`, `Platform`, `Handler`, `Host`, `PageCache`, `StartOptions`, `NitroOptions`                                                                                      |

`@kestack/kabuki/start/client` is there only for the browser entry the
plugin writes; an app never imports it.

## Usage

### A gate whose States decide what exists

This root signs a user in. While `Anonymous` it Invokes `login`, which Emits
`SignedIn` once the form is sent; while `Authenticated` it Provides `Session`
and Invokes `todos`.

```ts
export const Login = Actor.define('Login', {
  model: { name: Schema.String },
  message: { Typed: { name: Schema.String }, Submitted: {} },
  emits: { SignedIn: { user: Schema.String } },
});

export const LoginLive = Login.build({
  init: () => ({ model: { name: '' } }),
  on: {
    Typed: ({ name }) => ({ model: { name } }),
    Submitted: (_, { model }) => ({
      emit: { _tag: 'SignedIn', user: model.name },
    }),
  },
});

export const Auth = Actor.define('Auth', {
  requires: [Server],
  state: {
    Checking: {},
    Anonymous: {},
    Authenticated: { user: Schema.String },
  },
  message: {
    CheckedSession: { user: Schema.optional(Schema.String) },
    LoggedIn: { user: Schema.String },
    LoggedOut: {},
  },
});

export const AuthLive = Auth.build({
  init: () => ({ state: { _tag: 'Checking' } }),
  states: {
    Checking: {
      workers: {
        check: {
          run: (self) =>
            Effect.gen(function* () {
              const user = yield* (yield* Server).checkSession;
              yield* self.send({ _tag: 'CheckedSession', user });
            }),
        },
      },
      on: {
        CheckedSession: ({ user }) => ({
          state: user ? { _tag: 'Authenticated', user } : { _tag: 'Anonymous' },
        }),
      },
    },
    Anonymous: {
      children: {
        login: Actor.child(LoginLive, {
          emits: { SignedIn: ({ user }) => ({ _tag: 'LoggedIn', user }) },
        }),
      },
      on: {
        LoggedIn: ({ user }) => ({ state: { _tag: 'Authenticated', user } }),
      },
    },
    Authenticated: {
      children: { todos: Actor.child(TodosLive) },
      provides: {
        capabilities: [Session],
        layer: (self) =>
          Layer.succeed(Session, {
            user: self.get.pipe(Effect.map(({ state }) => state.user)),
            logOut: self.send({ _tag: 'LoggedOut' }),
          }),
      },
      on: { LoggedOut: () => ({ state: { _tag: 'Anonymous' } }) },
    },
  },
});
```

- `Actor.define` takes only the name, the Requires, the Schemas and what the Actor Emits, which fix every type, and imports nothing but other definitions. A struct is written as its fields, a tagged union as its cases by tag, as `Schema.TaggedUnion` takes them; a whole Schema works too. The Model is always a struct. The definition's own `build` is checked against them: an Update that returns a State the Schema does not have, or a `state.user` read where there is none, does not compile. The definition is `Auth`, the build `AuthLive`, side by side in one file.
- A build has two Levels. What is written at the top holds for as long as the Instance lives; what is written under `states`, in a State's block, holds while that State lasts. Each Level can hold `provides`, `children`, `on`, `workers` and `queries`.
- An Update gives only the fields of the Model that change; the rest stay as they are, and a Model whose fields all stay the same is the same object. An Update that returns a different `_tag` is a Transition: the old State's Children, Workers and Capabilities stop, the new State's start. A Child written at the top lasts through it.
- A level's `children` names each Child, made with `Actor.child`: `Actor.child(LoginLive, { … })`, the Actor, then when it exists, what it is handed and what the parent hears. `Actor.child` is typed by the level it is written in, its State narrowed in a State's block, so every function in it is checked against the parent's data and the Child's Actor. A Child that needs no Input and no Props is `Actor.child(TodosLive)`.
- What a Child tells its parent it Emits: its Update returns `emit`, checked against its `emits` Schema, and the slot's `emits` turns each into one of the parent's Messages, Sent to the parent right after. That Message is in the History as its own entry, Sent by the Child. An event the slot does not turn is not heard, so a Child fits any parent. Use Emits between a parent and its Child, and a Capability for what any Actor further down may need.
- A Worker is a named, scoped Effect given `self`: `send` to its own Instance, `get` and `changes` for its current data, and `now` for the app's Time. Written in the `Checking` block, `check` runs while that State lasts.
- Provides names the Capabilities a Level gives, `capabilities: [Session]`, beside the one Layer that builds exactly those: one named and not built, or built and not named, does not compile. Only the ones named reach the Children, so the Blueprint knows them with nothing running. The Layer is built each time its Level starts. A Capability that reads the Model reads it through `self`, so it never goes stale. It cancels out what the Children below it need; a need nothing cancels bubbles up to the app's Layer.
- Requires caps the Actor's own code: a Worker, Command or Provide that reaches for anything else does not compile. Update and init never see Capabilities.
- A Query is a question code outside the tree asks an Instance. `define` declares it, with what it is asked with and what it answers, `queries: { peers: { args: { room: Schema.String }, result: Schema.Array(Schema.String) } }`, and `build` answers it, `queries: { peers: (self, { room }) => Effect }`: it reads `self` and the Actor's Requires, and never Sends. Its args and answer are checked against their Schemas, and a Query answered but not declared does not compile. Written in a State's block it is askable only in that State, and the live Instance has it on its type only once `_tag` has narrowed to it. Asked of an Instance that has stopped or left the State, it fails with `Stopped`, from `@kestack/kabuki`.
- Outside code tells an Instance with `send`, which says what became of the Message: `handled`, `ignored` with no rule for it in that State, `queued` behind one being handled, or `refused`. It waits on one with `until`, `yield* session.until((s) => s._tag === 'Running')`, which answers with the Instance narrowed as the test narrows it, from data the History keeps, or fails with `Stopped`. A job that needs outside work and then a change asks a Query, then Sends.

### A list of Actors, a Command, and a Worker per key

```ts
const save = Command.make('save', {
  args: Schema.Struct({ id: Schema.String }),
  run: () =>
    Effect.sleep('1 second').pipe(Effect.as({ _tag: 'Saved' as const })),
});

const List = Actor.define('List', {
  model: {
    ids: Schema.Array(Schema.String),
    uploading: Schema.Array(Schema.String),
    next: Schema.Number,
  },
  message: {
    Added: {},
    Removed: { id: Schema.String },
    Saved: {},
    Uploaded: { id: Schema.String },
  },
});

const ListLive = List.build({
  init: () => ({ model: { ids: [], uploading: [], next: 0 } }),
  children: {
    rows: Actor.child(RowLive, {
      each: ({ model }) => model.ids,
      input: (_, id) => ({ text: `#${id}` }),
      props: ({ model }, id) => ({ uploading: model.uploading.includes(id) }),
      emits: { Remove: (_, id) => ({ _tag: 'Removed', id }) },
    }),
  },
  on: {
    Added: (_, { model }) => {
      const id = `${model.next}`;
      return {
        model: {
          ids: [...model.ids, id],
          uploading: [...model.uploading, id],
          next: model.next + 1,
        },
        command: save({ id }),
      };
    },
    Removed: ({ id }, { model }) => ({
      model: {
        ids: model.ids.filter((kept) => kept !== id),
        uploading: model.uploading.filter((kept) => kept !== id),
      },
    }),
    Saved: () => ({}),
    Uploaded: ({ id }, { model }) => ({
      model: { uploading: model.uploading.filter((k) => k !== id) },
    }),
  },
  workers: {
    upload: {
      each: ({ model }) => model.uploading,
      run: (self, id) =>
        Effect.sleep('3 seconds').pipe(
          Effect.andThen(self.send({ _tag: 'Uploaded', id })),
        ),
    },
  },
});
```

- A Child is made as a Worker is written: `Actor.child` takes its Actor, then always, `while` a test is true, or `each` key a function names, one Instance per key. Its `input`, `props` and `emits` are worked out from the parent's data and the Child's key, `''` unless it is one of `each`, so the List knows which Row Emitted `Remove`. After every Update, a new key Invokes a Row, a key gone stops it, and a key kept keeps its Instance. From then on the Row owns its data. A Child written with `while` stops when its test turns false and comes back as a fresh Instance.
- Props are what the parent says now, worked out again after each of its Updates: the Row declares them with `props` beside `input`, and its Update, its Workers' Conditions and its View read them. It never writes them, and a change runs none of its rules. Props equal to the last ones keep the Instance; new ones are not in the History, since Replay works them out again from the parent.
- Addresses are deterministic: `List/rows[0]#1` is the first `rows` keyed `0`, and a Child written in a State says so, as `Auth/Anonymous:login#1`. A key Invoked again gets `#2`, so a Message meant for the old Instance is dropped. An Address taken from a Snapshot knows its Actor, so only that Actor's Messages can be Sent to it.
- A Command is an errand, made once with `Command.make`: a name, the Schema of its args and the Effect it runs from them, ending with at most one Message. The Update asks for it with its args, `save({ id })`, which is plain data a test can compare; the args are checked when it runs. Nothing stops it but its Instance stopping, and there is no cancel. An Update may return a list of Commands; they run concurrently.
- A Worker runs for exactly as long as its Condition holds, read from the Model, State and Props whenever they change: where it is written, at the top or in a State, and within that always, `while` a test is true, or `each` key a function names, one Worker per key. Removing an id from `uploading` interrupts that upload and runs its finalizers; a finished upload Sends `Uploaded`, whose Update takes its key away. Stopping work is changing the Model.
- The Worker does the work and the Model keeps the story: every step the user could notice is a Message. A Worker must be able to start from the Model alone, because a Runtime made on a saved History, a Fork to an earlier Step, or a start after a stop starts every Worker whose Condition holds, and no Command runs again. A Worker that waits until a Time in the Model sleeps for `that - now`, so it waits only what is left. A finalizer never Sends.
- Time (`at`, `self.now`) is the app's stopwatch: 0 at init, carried on from the Head's Time when a Runtime is made or Forked, counting while it runs, and standing still while it is stopped. Use it for how long things take inside the app, such as an animation or a countdown. For a moment in the real world, a session that expires or a reminder at nine, send a real date in the Message and have the Worker wait on the real clock, so it holds across a reload, a Fork or a server starting over.

### Drawing it with React

```tsx
export const AuthView = View.make(AuthLive, ({ _tag, state, children }) => {
  switch (_tag) {
    case 'Checking':
      return <Spinner />;
    case 'Anonymous':
      return <LoginView instance={children.login} />;
    case 'Authenticated':
      return (
        <>
          <p>Signed in as {state.user}</p>
          <TodosView instance={children.todos} />
        </>
      );
  }
});

const RowView = View.make(RowLive, ({ model, props, root }) => (
  <li {...root} data-uploading={props.uploading}>
    {model.text}
  </li>
));
const MotionRow = motion.create(RowView);

const ListView = View.make(ListLive, ({ children }) => (
  <ul>
    {children.rows.map((row) => (
      <RowView key={row.address} instance={row} />
    ))}
  </ul>
));

const DemoApp = View.app(AuthView, { layer: ServerLive });
```

- One function draws every State. It gets `_tag`, `address`, `model`, `state`, `props`, `children` (Handles: one for a Child that is always there, one or `undefined` for a `while` Child, a list for an `each` Child, each with its `address` and its `key`), `send` and `root`; a `switch` on `_tag` narrows `state` and `children`. The DOM stays across a Transition. It never sees Capabilities, so it draws a Replay exactly like the live app.
- A Child is placed with `<RowView instance={handle} />`, keyed in a list by its `address`. A parent View hands it only where to draw; data from the parent is the Row's Props, which the parent Actor hands it, so its Update and Workers see the same.
- Spreading `root` on the View's own element hands it the parent's `ref` and `style`, so `motion.create(RowView)` animates it, with no wrapper element, and it stays memoized. A View whose Instance has stopped keeps drawing its last data, so `AnimatePresence` can play its exit.
- A View re-renders only when its own Instance's Model, State, Props or set of Children changes, or its `ref` or `style` does. Many Messages handled in a row make one render.
- `View.app` makes and owns the app's one Runtime. `DemoApp.useRuntime()` returns its `AppRuntime` from anywhere on the page: `{ name, runtime, seeking, seek, toHead, fork, start, stop, workers, instance, failure, subscribe }`. `runtime` is the Runtime, `null` until the first mount and on a server, and the same object through every Seek, Fork, stop and start. Its `history` is plain data: `History.line(runtime.history)` gives the entries on the Head's Branch, each with `to`, `message`, `at` and `from`, the Instance that Sent it and what in it did, and `History.tips` the last entry of every Branch. `seek(id)` draws the app right after that entry, on any Branch, `null` for init as with `runtime.seek`, while the Runtime stays where it is, and `toHead()` draws the Head again; `seeking` is the Step drawn. `fork(id)` moves the Runtime's Head there, `null` for init, so the next Message grows a new Branch. `stop()` stops every Worker, Command and Provide, and a click does nothing until `start()` runs it again at the Head. `workers(address)` says what an Instance's Workers are doing: running, finished, or failed; what it Provides is in its Blueprint. A Seek, start, stop or Fork that fails is logged with `console.error` and kept as `failure`, `{ what, error }`, until one succeeds.
- Work that must survive a stop or a Fork belongs in a Worker: Commands running at a stop are lost, and none runs again. The outside world is not rewound.
- What changes over time arrives as Messages: a Worker Sends a `Tick` or its progress, and the View draws the Model. motion can smooth what it draws from one Message to the next.
- `View.app` does not compile until its `layer` covers every Capability the tree still needs; a tree that Requires nothing needs no `layer`.
- Give `attach: [(app) => stop]` to run something beside the app, such as a devtool: each Attachment is called with the app's `AppRuntime` once its Runtime is made at the first mount in a browser, never on a server, and its `stop` at the last unmount or a hot reload. It holds the same object `useRuntime` returns, always read as it is now, and `app.subscribe` tells it of each change. One that throws is logged with `console.error`, and the app and the other Attachments run on. `Start.app({ …, attach })` hands them on in the same way. `Start.app({ …, loading })` is what the App Shell paints until the app is drawn.

### Running it, looking back, and drawing it before it runs

A Runtime runs outside React too, as a test or a server does. It Seeks any
Step while it stays where it is, Forks in place to carry on from one, and
the History saves as plain JSON.

```tsx
const runtime = Runtime.make(ListLive);
const list = runtime.snapshot.root.address;
runtime.send(list, { _tag: 'Added' }); // entry 0
runtime.send(list, { _tag: 'Added' }); // entry 1

// The app right after entry 0, as plain data; the Runtime stays where it is.
const past = runtime.seek(0); // { entry: 0, at, snapshot }
const second = Address.check(ListLive, 'List/rows[1]#1')!;
Snapshot.at(past.snapshot, second); // undefined: not started yet
Snapshot.trail(ListLive, runtime.history, second); // started at entry 1

// Drawn at its Head, or at a Step, where a click does nothing.
<Kabuki of={runtime} view={ListView} />;
<Kabuki of={past} view={ListView} />;

// A Fork moves the same Runtime back there; its next Message grows a new Branch.
await runtime.fork(0);
runtime.send(list, { _tag: 'Removed', id: '0' }); // entry 2
History.children(runtime.history, 0).map((entry) => entry.id); // [1, 2]
History.tips(runtime.history).map((entry) => entry.id); // [1, 2]

// Stopped, nothing runs and a Send throws Stopped.
await runtime.stop();
await runtime.start();

// Saved as plain JSON, and carried on from later.
const saved = History.save(ListLive, runtime.history);
const later = Runtime.make(ListLive, {
  history: History.load(ListLive, saved, { onMismatch: 'fail' }),
  window: 0,
});

// Drawn before it runs, on a server too.
const SavedApp = View.app(ListView, { saved });
```

- `Runtime.make(actor, { input, history, layer, window })` makes the app's one Runtime, running from the moment it is made, on a new History unless given one, with the app's Layer, which must cover what the tree still needs. While it runs, every Message Sent becomes a History entry after the Head, is played at once and runs its Commands, and `send` says what became of it. `stop()` stops every Worker, Provide and Command, and Time with it; `running` is then `false`, `send` throws `Stopped` and adds nothing, and Queries fail with `Stopped`. `start()` runs again at the Head: Workers and Provides start from its data, and no past Command runs again, as for a Runtime made on a saved History. `start()`, `stop()`, `fork()` and `dispose()` are Promises; Effect code makes one with `Runtime.scoped`, let go when its Scope closes.
- An Address taken from a Snapshot carries its Actor, so `send` takes only that Actor's Messages. `Address.check(actor, text)` turns text written by hand into one, if the root's Blueprint has a Child at every segment; it says nothing of whether an Instance is there now.
- `runtime.seek(id)` is the app right after an entry, on any Branch, `null` for init: a Step, the plain data `{ entry, at, snapshot }`, which changes nothing. Read any Instance in it with `Snapshot.at(step.snapshot, address)` and its Trail up to it with `Snapshot.trail(actor, history, address, step.entry)`. A devtool with a saved History and no Runtime reads the same with `Snapshot.replay(actor, history, id)`.
- `runtime.fork(id)` moves the same Runtime's Head to an entry, `null` for init, and its Time to that entry's; the next Message grows a new Branch, and the old ones stay. Running, its work stops and every Worker and Provide that entry's data asks for starts again from the Model alone; stopped, only the Head moves. No Command runs at a Fork. An Instance reached with `runtime.instance` before it reads as it was; reach the app again.
- `<Kabuki of={…} view={…} />` draws a Runtime at its Head, what its Views Send going to it while it runs, or a Step, what its Views Send dropped. `View.app` is the same with the Runtime made and owned for you.
- `History.save(actor, history)` gives its entries and its Head, each Message, and each Instance of a Restore's Snapshot, written through its Actor's Schemas and read back through them by `History.load`. So the encoded side of every Schema must be JSON-safe, and then it is plain JSON: a `Date` as `Schema.DateFromString`, an `Option` as `Schema.OptionFromNullOr`. A saved History never changes, and one whose Head is not one of its entries fails to load. `onMismatch: 'fail'` throws at load when what was saved no longer fits the code, where the default warns, skips it, and may start from init. `History.restored(snapshot, { input, at })` makes the lightest one, a History of one Restore right after init, for an app that saves only its Snapshot; init stays the first Step.
- Where the History is kept is the app's business. A server saves it as it changes, `runtime.changes.pipe(Stream.map(() => History.save(runtime.actor, runtime.history)), Stream.debounce('100 millis'), Stream.runForEach(write))`, with a finalizer for the last write, and starts again from `History.load`.
- `window` keeps only that many entries on the Head's Branch, 100 unless said: the oldest kept becomes a Restore of the Snapshot right after it, and Time Travel reaches nothing before it. `0` keeps only the app as it is now, as a server wants, and `null` keeps every entry. `runtime.keep(n)` changes it at any time, running or stopped. An app made with `View.app` remembers a Window changed that way in `localStorage` under its name, and starts from it after a reload, over the `window` it was given.
- `View.app` draws the app before any Runtime exists: with no History, right after init; with a `saved` one, at its Head, replayed through Suspense. A server or a static build gets the same HTML the client hydrates. The first mount makes the Runtime, running at the Head; until then a Send is dropped.
- When the last mount closes, the History is left under the app's name, the root Actor's by default, and the next mount of an app with that name carries on from it: the same component mounted again, or a new one after a hot reload, whose code replays the old Messages. A Message the new code handles differently warns and goes on. Give `name` when two apps share a root Actor and must not share a History; two apps of one name mounted at once is a console error.
