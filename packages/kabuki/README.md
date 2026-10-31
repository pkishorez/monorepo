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
and what it must control it owns, as React lifts state up.

The whole app is one immutable Snapshot, and handling a Message is a pure
function from one Snapshot to the next. There is one mailbox, and a Message is
handled before `send` returns. Around that pure core, everything that touches
the outside world is Effect: each Instance's work lives in nested Scopes, and
only the work where a Message landed is stopped or started. An Actor's own
code reaches only the Capabilities it Requires. What its Children need bubbles
up until an ancestor Provides it, and the app does not compile until its Layer
covers the rest.

The Runtime runs a History. It starts the root Instance at the History's
Head, hands it every Message through one Mailbox, and writes each one into
the History; every Instance runs the rest of its own life, starting and
stopping its States, Children, Workers and Commands. The History is a tree
of Messages, like git commits, that replays itself to the Snapshot right
after any one of them, on any Branch, while the live app keeps running. Stop,
move its Head, and start again, and new Messages grow a new Branch. A History
is also what an app is saved as and drawn from before it runs: on a server,
at build time, and across a hot reload.

Routing is a layer on top, in `@kestack/kabuki/routing`, that core never
imports: a page is an Actor with a place in the URL. The router is read down
from the pages' definitions, so any build can import it and name a Route by
type. One Router Actor above the pages holds the history and the data of
every page on screen, and hands each page its own as Props, so a page move
is one Message and a page is a Child coming and going. It routes in memory
by default; the browser's history and TanStack Router's are Adapters, each
its own subpath. How it fits together is in
[docs/routing.md](./docs/routing.md).

Start, in `@kestack/kabuki/start` and its Vite plugin, serves a routed app
from a Cloudflare Worker: for a URL it runs the Loaders of the places it
names at once, starts every page from what its Loader gave, and sends the HTML with the
Snapshot beside it, which the browser hydrates and carries on from. It never
runs a Runtime on the server. An app writes three files: its pages, its app
with its Document and what it needs in the browser, and its Loaders with what
they need on the server, as a Layer made once and one made per visitor; the
plugin writes every entry. Each
platform is an adapter of its own subpath: Cloudflare Workers, or through
Nitro any host it has a preset for, Node, Bun, Vercel and AWS Lambda among them. For what stands in
front of the app, such as a service worker, Start serves its Pages, each with
how its first drawing is made, and its App Shell, which the browser draws the
app in at its own URL; it knows nothing of what uses them. How it works is in
[docs/start.md](./docs/start.md).

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

| Export             | What it does                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Actor.define`     | Says what an Actor is: its name, Requires and Schemas, which fix every type. It runs nothing.                                                                               |
| `Actor.build`      | Says how a defined Actor behaves, at the top and in one block per State: the build is what runs and is drawn.                                                               |
| `Command.make`     | Defines a Command from its name, the Schema of its args and the Effect it runs; an Update calls it with the args.                                                           |
| `Runtime.start`    | Runs an Actor, or carries a History on, inside a Scope, with the app's Layer; gives back `send`, `start` and `stop`. Started from an Actor, its History keeps no Messages.  |
| `running.changes`  | The live Snapshot as an Effect Stream: now, then whenever the app settles; a slow reader gets only the latest.                                                              |
| `running.instance` | The root Instance, typed and live, for code outside the tree: reads any Instance's data, Children and Workers, asks its Queries, and Sends to it from outside under a name. |
| `History.make`     | A new, empty History for an Actor, with the root's Input.                                                                                                                   |
| `History.load`     | A History carrying on from one saved before, read with the Actor's code as it is now.                                                                                       |
| `History.restored` | The lightest History an app can be saved as: one Restore of a Snapshot at a Time, right after init.                                                                         |
| `history.changes`  | The History as plain JSON in an Effect Stream: now, then after every change, so saving it is `Stream.debounce` and `Stream.runForEach`.                                     |
| `history.keep`     | Sets the History's Window, how many entries it keeps; older ones Compact into a Restore. Works while it runs.                                                               |
| `Replay.make`      | Plays Branches of one app from init, remembering Snapshots so playing again starts from the nearest one.                                                                    |
| `Replay.fold`      | The Snapshot right after a Branch, played now from init with the root's Input, with no yielding.                                                                            |
| `restore`          | The Restore Message: given to the root, it replaces the whole Snapshot with a saved one, checked against the Actors.                                                        |
| `isRestore`        | Tells a Restore from any other Message.                                                                                                                                     |
| `RESTORE`          | The Restore Message's tag.                                                                                                                                                  |
| `init`             | The Snapshot right after init: the root and every Child its State Invokes.                                                                                                  |
| `handle`           | Applies one Envelope to a Snapshot and gives the next one, purely.                                                                                                          |
| `outcomeOf`        | Works out what came of one Envelope on a Snapshot: handled, ignored or dropped. The History never keeps it.                                                                 |
| `instanceAt`       | Finds the Instance with an ID in a Snapshot.                                                                                                                                |
| `isMany`           | Tells the list of an `each` Child from one Instance in an Instance's Children.                                                                                              |

### `@kestack/kabuki/react`

| Export         | What it does                                                                                                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `View.make`    | Defines how one built Actor is drawn, one function for every State, as a React component that takes the Instance, and a `ref` and `style`, from its parent; the View carries its Actor as `.actor`.                                                                        |
| `toReact`      | Turns a root Actor, its View and a Layer into one React component that runs the whole app, one Runtime for every mount; `useRuntime` reads its History, shows any Step, and stops and starts it. Drawn before it runs, on a server too, from a saved History if given one. |
| `View.lazy`    | A View of the Actor it is given first, whose code is loaded the first time it is drawn, or on `preload()`; a server waits for it before it sends, and tells the App's `onLazyView`.                                                                                        |
| `View.preload` | Loads the lazy Views made with these ids, so a browser hydrating a page a server drew never waits on their code.                                                                                                                                                           |
| `useChild`     | Reads one Child's Model, State and Props from its parent's View, to draw, or only what an optional selector picks; an escape hatch that can never Send.                                                                                                                    |
| `useChildren`  | Reads the Instances of an `each` Child the same way, in order; only the component that calls it re-renders, as they change or as what the selector picks does.                                                                                                             |
| `lazyOf`       | Finds the lazy View made for an Actor, if one was, to load its code before it is drawn.                                                                                                                                                                                    |
| `useLive`      | Says whether the app is drawn as it is now, not at a past Step, so an effect that touches the page around it can stay still under Time Travel.                                                                                                                             |

### `@kestack/kabuki/routing`

| Export                        | What it does                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Page.define`                 | Says what a page is: an Actor definition with a place in the URL, its params, query, data, Render Mode, Metadata and the definitions of the pages under it.                                                                                                                                                                                                                  |
| `Page.build`                  | Says how a page behaves, as `Actor.build` takes it, with the build of each page under it in `pages`; a page is drawn with `View.make`.                                                                                                                                                                                                                                       |
| `Page.notFound`               | What a Loader fails with when its place is not found.                                                                                                                                                                                                                                                                                                                        |
| `Page.redirect`               | What a Loader fails with to send the app to another of its Routes, or to a whole URL outside it; `{ permanent: true }` makes a server answer `308` rather than `302`.                                                                                                                                                                                                        |
| `Page.NotFound`               | The Schema of a Loader's not-found failure, to carry it over the wire.                                                                                                                                                                                                                                                                                                       |
| `Page.Redirect`               | The Schema of a Loader's Redirect, to carry it over the wire.                                                                                                                                                                                                                                                                                                                |
| `Page.wholeQuery`             | A query field holding the whole query as written, every pair of it, a repeated or undeclared one too: for a page whose query is someone else's to say, as a signed request. Written back whole, the page's other fields over it.                                                                                                                                             |
| `Router.define`               | Reads the app's router down from the root page's definition: a constructor per place, the URL both ways, each place's Metadata and Render Mode, every path, the typing of the Loaders, and how the Router behaves in the browser, such as how long a move waits for its data, `delay` (150 ms), and how long a loading screen stays at least once drawn, `minimum` (300 ms). |
| `Router.app`                  | Puts the Router above the root page's View: it holds the history, every move and every page's data; gives the Actor, its View, `startAt` and `href`. With `scrollRestoration: true` on the router it restores scroll as TanStack Router does.                                                                                                                                |
| `Router.Link`                 | Draws a plain `<a href>` to a Route, preloading it on hover, once in view, or never, going to an element on the page with `hash`, and leaving every scroll as it is with `resetScroll={false}`; the Router catches a plain click and moves the app.                                                                                                                          |
| `Router.Retry`                | A button that loads every page on screen again, for a page whose Loader broke.                                                                                                                                                                                                                                                                                               |
| `Router.memory`               | A `Loading` that runs the Loaders in place, for tests, stories and the server.                                                                                                                                                                                                                                                                                               |
| `Router.cached`               | Puts the Data cache in front of a `Loading`: the last data of each place, shown at once on Back, a link or a preload.                                                                                                                                                                                                                                                        |
| `Router.push`                 | A Command that moves the app to a Route, as a new entry.                                                                                                                                                                                                                                                                                                                     |
| `Router.replace`              | A Command that puts a Route in place of the current entry, so Back skips it.                                                                                                                                                                                                                                                                                                 |
| `Router.back`                 | A Command that goes Back.                                                                                                                                                                                                                                                                                                                                                    |
| `Router.forward`              | A Command that goes Forward.                                                                                                                                                                                                                                                                                                                                                 |
| `Router.backTo`               | A Command that goes Back when the app came from a Route, and replaces the entry with it otherwise: closing a dialog with a Route of its own.                                                                                                                                                                                                                                 |
| `Router.reload`               | A Command that loads every page on screen again, as after a save; the pages and their Models stay. `Router.reload({ anew: true })`, when what the data belongs to changed, as the signed-in account: the data shown goes, held and then loading as on a move; with `hold: true`, held until the new data comes, the Command ending once it lands.                            |
| `Router.preload`              | A Command that warms the Data cache, and the code of the lazy Views, for a Route.                                                                                                                                                                                                                                                                                            |
| `Navigation`                  | The Capability the Router Provides to every page, which an Actor under a page that moves the app lists in its Requires.                                                                                                                                                                                                                                                      |
| `Loading`                     | The Capability the Router uses, if the Layer has it, to load the data of places.                                                                                                                                                                                                                                                                                             |
| `useRouter`                   | Reads the Router from a component drawn inside the app: the current Route and URL, the history, the move it holds while it loads as `pending`, the title, Back, Forward, reload and preload; `useRouter<Route>()` types its Routes as the app's.                                                                                                                             |
| `useElementScrollRestoration` | Reads where an element, or the window, was scrolled on the entry drawn, as scroll restoration kept it: for a virtual list that puts itself back.                                                                                                                                                                                                                             |

### `@kestack/kabuki/routing/adapter`

| Export    | What it does                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `Adapter` | The service where an app's address lives, which each adapter below gives: write one for any other history. |
| `KEY`     | The key the Router keeps in a history entry's state, so Back and Forward land on an entry it knows.        |
| `keyIn`   | Reads that key from a history entry's state, if the Router wrote one.                                      |

### `@kestack/kabuki/routing/browser`

| Export    | What it does                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `browser` | A Layer that puts the app's address in the browser's own history, for an app that owns the whole site or everything under its base. |

### `@kestack/kabuki/routing/tanstack`

| Export     | What it does                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tanstack` | A Layer that puts the app's address in TanStack Router's history, for an app on a TanStack Start catch-all route; TanStack gets back every URL outside the base. |

### `@kestack/kabuki/start`

| Export             | What it does                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Start.app`        | Takes the app's router, its root page's View, its Document, what the Actors Require in the browser, checked against them, its `name` there, and what to `attach` there: what `src/app` default-exports. |
| `Start.Document`   | The plainest Document, Start's parts in an English page: what an app that gives none is drawn in.                                                                                                       |
| `Start.Head`       | Draws, in the Document's `<head>`, the charset and viewport (its own with `viewport`), the Metadata, and the styles and chunks the page needs.                                                          |
| `Start.Scripts`    | Draws, at the end of the Document's `<body>`, the saved History as JSON and the script that hydrates the page.                                                                                          |
| `Start.useDrawn`   | Reads when and by which build the server drew the page, and whether the component asking was in that drawing or drawn later by the browser.                                                             |
| `Start.useRuntime` | Reads the running app from the Document, for devtools drawn around it; `null` on the server.                                                                                                            |
| `Start.pages`      | Where the server answers the Pages as JSON (`Start.Pages`): the build, where the App Shell is, and every page with its path, whether it has params, and its Render Mode.                                |

### `@kestack/kabuki/start/platform`

The port each platform's adapter fills, in types only: no runtime value.

### `@kestack/kabuki/start/cloudflare`

| Export       | What it does                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflare` | Cloudflare Workers, for `start({ platform: cloudflare() })`: the server built as one module in its edge form.                     |
| `serve`      | Start's handler as a Worker's `fetch`, handed the Worker's env and the Cloudflare Cache: what the server's entry default-exports. |

### `@kestack/kabuki/start/nitro`

| Export  | What it does                                                                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nitro` | Any Nitro preset, for `start({ platform: nitro({ preset: 'vercel' }) })` beside Nitro's own plain `nitro()` plugin, which it hands the preset; Nitro builds the server for the host and serves the assets. |
| `serve` | Start's handler as Nitro's SSR entry, handed the Worker's env and the Cloudflare Cache on Cloudflare, and the process's env elsewhere: what the server's entry default-exports.                            |

### `@kestack/kabuki/start/vite`

| Export  | What it does                                                                                                                                                                                                                                                     |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start` | The Vite plugin: builds for the platform its adapter names, finds the app's two files by name, writes Start's handler, the server's and the browser's entries, names every lazy View by its module, and serves SSR in dev; works under Alchemy's `Website.Vite`. |

### `@kestack/kabuki/start/server`

| Export                  | What it does                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handler`               | Makes Start's handler, which knows no platform, from what the app's two files export: what the plugin's handler module runs; an app calls it only in a test.                                                                                    |
| `Start.server`          | Takes Loaders that Require nothing alone, or first what they Require on the server, a `layer` made once and a `visitor` made per request, then the Loaders with `.loaders(…)`, checked against both: what `src/loaders.server` default-exports. |
| `Start.env`             | Reads the platform's env, typed as the app says it is, from `Start.Env`.                                                                                                                                                                        |
| `Start.Env`             | The service holding the platform's env for this request: a Worker's bindings, or the process's.                                                                                                                                                 |
| `Start.Request`         | The service holding the request being answered, for the visitor and the dynamic and client Loaders only.                                                                                                                                        |
| `Start.ResponseHeaders` | The service a dynamic or client Loader, or the visitor, adds headers to its response with, as a refreshed session's `set-cookie`.                                                                                                               |

### `@kestack/kabuki/start/client`

| Export    | What it does                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`  | Hydrates a page the Worker drew, from the History it saved in it: what the plugin's browser entry runs; an app never calls it.                                    |
| `loading` | The `Loading` that asks the server for the data of places at `POST /_kabuki/load`, each answered as it comes: what `client` hydrates with, behind the Data cache. |

## Usage

### A gate whose States decide what exists

This root signs a user in. While `Anonymous` it Provides `SignIn` and Invokes
`login`; while `Authenticated` it Provides `Session` and Invokes `todos`.

```ts
export const Auth = Actor.define('Auth', {
  requires: [Server],
  state: Schema.TaggedUnion({
    Checking: {},
    Anonymous: {},
    Authenticated: { user: Schema.String },
  }),
  message: Schema.TaggedUnion({
    CheckedSession: { user: Schema.optional(Schema.String) },
    LoggedIn: { user: Schema.String },
    LoggedOut: {},
  }),
});

export const AuthLive = Actor.build(Auth, {
  init: () => ({ state: { _tag: 'Checking' } }),
  state: {
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
      children: { login: { actor: LoginLive } },
      provides: (self) =>
        Layer.succeed(SignIn, {
          complete: (user) => self.send({ _tag: 'LoggedIn', user }),
        }),
      on: {
        LoggedIn: ({ user }) => ({ state: { _tag: 'Authenticated', user } }),
      },
    },
    Authenticated: {
      children: { todos: { actor: TodosLive } },
      provides: (self) =>
        Layer.succeed(Session, {
          user: self.get.pipe(Effect.map(({ state }) => state.user)),
          logOut: self.send({ _tag: 'LoggedOut' }),
        }),
      on: { LoggedOut: () => ({ state: { _tag: 'Anonymous' } }) },
    },
  },
});
```

- `Actor.define` takes only the name, the Requires and the Schemas, which fix every type, and imports nothing but other definitions. `Actor.build` is checked against them: an Update that returns a State the Schema does not have, or a `state.user` read where there is none, does not compile. The definition is `Auth`, the build `AuthLive`, side by side in one file.
- A build has two Levels. What is written at the top holds for as long as the Instance lives; what is written in a State's block holds while that State lasts. Each Level can hold `provides`, `children`, `on`, `workers` and `queries`.
- An Update that returns a different `_tag` is a Transition: the old State's Children, Workers and Capabilities stop, the new State's start. A Child written at the top lasts through it.
- A Worker is a named, scoped Effect given `self`: `send` to its own Instance, `get` and `changes` for its current data, and `now` for the app's Time. Written in the `Checking` block, `check` runs while that State lasts.
- Provides is one Layer per Level, built each time its Level starts. A Capability that reads the Model reads it through `self`, so it never goes stale. It cancels out what the Children below it need; a need nothing cancels bubbles up to the app's Layer.
- Requires caps the Actor's own code: a Worker, Command or Provide that reaches for anything else does not compile. Update and init never see Capabilities.
- A Query is a question code outside the tree asks an Instance, `queries: { peers: { run: (self, args) => Effect } }`: it reads `self` and the Actor's Requires, and never Sends. Written in a State's block it is askable only in that State, and the live Instance has it on its type only once `_tag` has narrowed to it. Asked of an Instance that has stopped or left the State, it fails with `Stopped`.

### A list of Actors, a Command, and a Worker per key

```ts
const save = Command.make('save', {
  args: Schema.Struct({ id: Schema.String }),
  run: () =>
    Effect.sleep('1 second').pipe(Effect.as({ _tag: 'Saved' as const })),
});

const List = Actor.define('List', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    uploading: Schema.Array(Schema.String),
    next: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    Added: {},
    Removed: { id: Schema.String },
    Saved: {},
    Uploaded: { id: Schema.String },
  }),
});

const ListLive = Actor.build(List, {
  init: () => ({ model: { ids: [], uploading: [], next: 0 } }),
  children: {
    rows: {
      actor: RowLive,
      each: ({ model }) => model.ids,
      input: (_, id) => ({ text: `#${id}` }),
      props: ({ model }, id) => ({ uploading: model.uploading.includes(id) }),
    },
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
        ...model,
        ids: model.ids.filter((kept) => kept !== id),
        uploading: model.uploading.filter((kept) => kept !== id),
      },
    }),
    Saved: () => ({}),
    Uploaded: ({ id }, { model }) => ({
      model: { ...model, uploading: model.uploading.filter((k) => k !== id) },
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

- A Child is written as a Worker is: its `actor`, then always, `while` a test is true, or `each` key a function names, one Instance per key. Its `input` and `props` are worked out from the parent's data and the Child's key, `''` unless it is one of `each`. After every Update, a new key Invokes a Row, a key gone stops it, and a key kept keeps its Instance. From then on the Row owns its data. A Child written with `while` stops when its test turns false and comes back as a fresh Instance.
- Props are what the parent says now, worked out again after each of its Updates: the Row declares them with `props` beside `input`, and its Update, its Workers' Conditions and its View read them. It never writes them, and a change runs none of its rules. Props equal to the last ones keep the Instance; new ones are not in the History, since Replay works them out again from the parent.
- Instance IDs are deterministic: `List/rows[0]#1` is the first `rows` keyed `0`. A key Invoked again gets `#2`, so a Message meant for the old Instance is dropped.
- A Command is an errand, made once with `Command.make`: a name, the Schema of its args and the Effect it runs from them, ending with at most one Message. The Update asks for it with its args, `save({ id })`, which is plain data a test can compare; the args are checked when it runs. Nothing stops it but its Instance stopping, and there is no cancel. An Update may return a list of Commands; they run concurrently.
- A Worker runs for exactly as long as its Condition holds, read from the Model, State and Props whenever they change: where it is written, at the top or in a State, and within that always, `while` a test is true, or `each` key a function names, one Worker per key. Removing an id from `uploading` interrupts that upload and runs its finalizers; a finished upload Sends `Uploaded`, whose Update takes its key away. Stopping work is changing the Model.
- The Worker does the work and the Model keeps the story: every step the user could notice is a Message. A Worker must be able to start from the Model alone, because a resume or a start from an earlier History entry starts every Worker whose condition holds. A Worker that waits until a Time in the Model sleeps for `that - now`, so it waits only what is left. A finalizer never Sends.
- Time (`at`, `self.now`) is the app's stopwatch: it stands still while the app is stopped, so use it for how long things take inside the app, such as an animation or a countdown that pauses with it. For a moment in the real world, a session that expires or a reminder at nine, send a real date in the Message and have the Worker wait on the real clock, so it holds across a reload or a server starting over.

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

const DemoApp = toReact(AuthLive, AuthView, ServerLive);
```

- One function draws every State. It gets `_tag`, `model`, `state`, `props`, `children` (Handles: one for a Child that is always there, one or `undefined` for a `while` Child, a list for an `each` Child, each with its `key`), `send` and `root`; a `switch` on `_tag` narrows `state` and `children`. The DOM stays across a Transition. It never sees Capabilities, so it draws a Replay exactly like the live app.
- A Child is placed with `<RowView instance={handle} />`. A parent View hands it only where to draw; data from the parent is the Row's Props, which the parent Actor hands it, so its Update and Workers see the same.
- Spreading `root` on the View's own element hands it the parent's `ref` and `style`, so `motion.create(RowView)` animates it, with no wrapper element, and it stays memoized. A View whose Instance has stopped keeps drawing its last data, so `AnimatePresence` can play its exit.
- A View re-renders only when its own Instance's Model, State, Props or set of Children changes, or its `ref` or `style` does. Many Messages handled in a row make one render.
- `DemoApp.useRuntime()` returns `{ history, branch, head, running, shown, show, start, stop, clear, workers, provided, failure, subscribe }` from anywhere on the page. Each `branch` entry is only its Envelope: `destination`, `message`, `at`, and `source`, the Instance that Sent it and what in it did; `history.outcome(id)` works out whether it was handled, ignored or dropped, and `history.snapshotAt(id)` takes the app apart there. `show(id)` draws the app right after that entry, on any Branch, while the live app runs on; `stop()` closes every Worker, Command and Capability; `start(id)` moves the Head to that entry and goes live there, growing a new Branch, and `start()` carries on from the Head, at its Time. `workers(id)` says what an Instance's Workers are doing live: running, finished, or failed; `provided(id)` names the Capabilities it provides now, at its top and in its State. A start, stop or clear that fails, like the Runtime's first start or `start(id)` with no such entry, is logged with `console.error` and kept as `failure`, an Effect `Cause`, until one succeeds.
- Work that must survive a stop belongs in a Worker: Commands running at a stop are lost. The outside world is not rewound.
- What changes over time arrives as Messages: a Worker Sends a `Tick` or its progress, and the View draws the Model. motion can smooth what it draws from one Message to the next.
- `toReact` does not compile until the Layer covers every Capability the tree still needs.
- Give `attach: [(runtime) => stop]` to run something beside the app, such as a devtool: each Attachment is called with the running app at the first mount in a browser, never on a server, and its `stop` at the last unmount or a hot reload. It holds the same object `useRuntime` returns, always read as it is now, and `runtime.subscribe` tells it of each change. One that throws is logged with `console.error`, and the app and the other Attachments run on. `Start.app({ …, attach })` hands them on in the same way.

### Drawing it before it runs

```tsx
const DemoApp = toReact(AuthLive, AuthView, ServerLive, { saved });
```

- The app is drawn before any Runtime exists: with no History, right after init; with a saved one, at its Head, replayed through Suspense. A server or a static build gets the same HTML the client hydrates, and `useRuntime` reads the saved History from the start, so a Timeline is drawn there too. Until the Runtime starts, a Send is dropped.
- `saved` is what `history.save()` gives: its entries and its Head, each Message, and each Instance of a Restore's Snapshot, written through its Actor's Schemas and read back through them on load. So the encoded side of every Schema must be JSON-safe, and then it is plain JSON: a `Date` as `Schema.DateFromString`, an `Option` as `Schema.OptionFromNullOr`. A saved History never changes, and one whose Head is not one of its entries fails to load. The Runtime carries on live at the Head, with Time going on from the Head's. `History.restored(AuthLive, snapshot, at).save()` makes the lightest one, a History of one Restore right after init, for an app that saves only its Snapshot; init stays the first Step. Where the History is kept is the app's business: `history.changes` streams it as it changes, so a server saves it with `Stream.debounce` and `Stream.runForEach` and a finalizer for the last write, and starts again from `History.load(actor, saved, { window: 0, onMismatch: 'fail' })`. `onMismatch: 'fail'` throws at load when what was saved no longer fits the code, where the default warns, skips it, and may start from init. Give `window` to keep only that many entries on the Head's Branch: the oldest kept becomes a Restore of the Snapshot right after it, and Time Travel reaches nothing before it. `history.keep(n)` changes it at any time, `history.keep(null)` stops Compacting. A Runtime started from an Actor keeps none, only the app as it is now, and an app made with `toReact` keeps the last 100. An app made with `toReact` remembers a Window changed that way in `localStorage` under its name, and starts from it after a reload, over the `window` it was given.
- When the last mount closes, the History is left under the app's name, the root Actor's by default, and the next mount of an app with that name carries on from it: the same component mounted again, or a new one after a hot reload, whose code replays the old Messages. A Message the new code handles differently warns and goes on. Give `name` when two apps share a root Actor and must not share a History; two apps of one name mounted at once is a console error.
