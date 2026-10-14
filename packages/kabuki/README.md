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
Keyed Children follow the Model: a list of items can be a list of Actors.
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
imports: one Router Actor above the app holds its history and hands the
current Route down as Props, so a page move is one Message and a page is a
Child coming and going. It routes in memory by default; the browser's history
and TanStack Router's are Adapters, each its own subpath. How it fits
together is in [docs/routing.md](./docs/routing.md).

Start, in `@kestack/kabuki/start` and its Vite plugin, serves a routed app
from a Cloudflare Worker: for a URL it runs the Loaders of the places it
names at once, starts every page from its Input, and sends the HTML with the
Snapshot beside it, which the browser hydrates and carries on from. It never
runs a Runtime on the server. An app writes its Routes, its app, its Loaders
and, if it wants one, its Document; the plugin writes every entry. How it
works is in [docs/start.md](./docs/start.md).

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

| Export             | What it does                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `Actor.make`       | Defines an Actor from its Requires and Schemas. `.build` adds how it behaves, at the top and in one block per State. |
| `Actor.many`       | Declares a keyed Child slot: one Instance of an Actor per key the parent Invokes.                                    |
| `Command.make`     | Defines a Command from its name, the Schema of its args and the Effect it runs; an Update calls it with the args.    |
| `Runtime.start`    | Runs an Actor, or carries a History on, inside a Scope, with the app's Layer; gives back `send`, `start` and `stop`. |
| `History.make`     | A new, empty History for an Actor, with the root's Input.                                                            |
| `History.load`     | A History carrying on from one saved before, read with the Actor's code as it is now.                                |
| `History.restored` | The lightest History an app can be saved as: one Restore of a Snapshot at a Time, right after init.                  |
| `history.keep`     | Sets the History's Window, how many entries it keeps; older ones Compact into a Restore. Works while it runs.        |
| `Replay.make`      | Plays Branches of one app from init, remembering Snapshots so playing again starts from the nearest one.             |
| `Replay.fold`      | The Snapshot right after a Branch, played now from init with the root's Input, with no yielding.                     |
| `restore`          | The Restore Message: given to the root, it replaces the whole Snapshot with a saved one, checked against the Actors. |
| `isRestore`        | Tells a Restore from any other Message.                                                                              |
| `RESTORE`          | The Restore Message's tag.                                                                                           |
| `init`             | The Snapshot right after init: the root and every Child its State Invokes.                                           |
| `handle`           | Applies one Envelope to a Snapshot and gives the next one, purely.                                                   |
| `outcomeOf`        | Works out what came of one Envelope on a Snapshot: handled, ignored or dropped. The History never keeps it.          |
| `instanceAt`       | Finds the Instance with an ID in a Snapshot.                                                                         |
| `isMany`           | Tells a keyed Child slot from a fixed one in an Instance's Children.                                                 |

### `@kestack/kabuki/react`

| Export         | What it does                                                                                                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `View.make`    | Defines how one Actor is drawn, one function for every State, as a React component that takes the Instance, and a `ref` and `style`, from its parent.                                                                                                                      |
| `toReact`      | Turns a root Actor, its View and a Layer into one React component that runs the whole app, one Runtime for every mount; `useRuntime` reads its History, shows any Step, and stops and starts it. Drawn before it runs, on a server too, from a saved History if given one. |
| `View.lazy`    | A View whose code is loaded the first time it is drawn, or on `preload()`; a server waits for it before it sends, and tells the App's `onLazyView`.                                                                                                                        |
| `View.preload` | Loads the lazy Views made with these ids, so a browser hydrating a page a server drew never waits on their code.                                                                                                                                                           |
| `useChild`     | Reads one fixed Child's Model, State and Props from its parent's View, to draw, or only what an optional selector picks; an escape hatch that can never Send.                                                                                                              |
| `useChildren`  | Reads a slot of keyed Children the same way, in order; only the component that calls it re-renders, as they change or as what the selector picks does.                                                                                                                     |

### `@kestack/kabuki/routing`

| Export           | What it does                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Route.tree`     | Defines every place of an app once: a constructor per place, a Schema per node's Props, per Input and of every place's dotted name, the URL both ways, each place's Metadata and Render Mode, the typing of its Loaders, and an outlet per node with children; also the root's Metadata and the not-found Route's. |
| `Route.path`     | One place: its path template, params, query, Input, Render Mode and Metadata, and the places under it.                                                                                                                                                                                                             |
| `Route.notFound` | What a Loader fails with when its place is not found.                                                                                                                                                                                                                                                              |
| `Route.redirect` | What a Loader fails with to send the app to another Route.                                                                                                                                                                                                                                                         |
| `Route.NotFound` | The Schema of a Loader's not-found failure, to carry it over the wire.                                                                                                                                                                                                                                             |
| `Route.Redirect` | The Schema of a Loader's Redirect, to carry it over the wire.                                                                                                                                                                                                                                                      |
| `Router.app`     | Puts the Router above an app's root: it holds the history and hands the current Route down as Props; gives the Actor, its View, `startAt`, `href` and the Routes.                                                                                                                                                  |
| `Router.Link`    | Draws a plain `<a href>` to a Route; the Router catches a plain click and moves the app.                                                                                                                                                                                                                           |
| `Router.memory`  | A `Loading` that runs the Loaders in place, for tests and stories.                                                                                                                                                                                                                                                 |
| `Router.push`    | A Command that moves the app to a Route as a new entry.                                                                                                                                                                                                                                                            |
| `Router.replace` | A Command that puts a Route in place of the current entry, so Back skips it.                                                                                                                                                                                                                                       |
| `Router.back`    | A Command that goes Back.                                                                                                                                                                                                                                                                                          |
| `Router.forward` | A Command that goes Forward.                                                                                                                                                                                                                                                                                       |
| `Router.backTo`  | A Command that goes Back when the app came from a Route, and replaces the entry with it otherwise: closing a dialog with a Route of its own.                                                                                                                                                                       |
| `Navigation`     | The Capability the Router Provides, which an Actor that moves the app lists in its Requires.                                                                                                                                                                                                                       |
| `Loading`        | The Capability the Router uses, if the Layer has it, to load the Inputs a move needs.                                                                                                                                                                                                                              |
| `usePending`     | Reads the move the Router waits on while it loads Inputs, for a progress bar; `usePending<Route>()` types its Route as the app's.                                                                                                                                                                                  |
| `useRouter`      | Reads the Router from a component drawn inside the app: the current Route and URL, the history, the title, and Back and Forward; `useRouter<Route>()` types its Routes as the app's.                                                                                                                               |

### `@kestack/kabuki/routing/browser`

| Export    | What it does                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `browser` | A Layer that puts the app's address in the browser's own history, for an app that owns the whole site or everything under its base. |

### `@kestack/kabuki/routing/tanstack`

| Export     | What it does                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tanstack` | A Layer that puts the app's address in TanStack Router's history, for an app on a TanStack Start catch-all route; TanStack gets back every URL outside the base. |

### `@kestack/kabuki/start`

| Export           | What it does                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Start.Head`     | Draws, in the Document's `<head>`, the charset and viewport, the Metadata, and the styles and chunks the page needs.                        |
| `Start.Scripts`  | Draws, at the end of the Document's `<body>`, the saved History as JSON and the script that hydrates the page.                              |
| `Start.useDrawn` | Reads when and by which build the server drew the page, and whether the component asking was in that drawing or drawn later by the browser. |

### `@kestack/kabuki/start/vite`

| Export  | What it does                                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `start` | The Vite plugin: finds the app's files by name, writes the Worker's and the browser's entries, names every lazy View by its module, and serves SSR in dev; works under Alchemy's `Website.Vite`. |

### `@kestack/kabuki/start/server`

| Export   | What it does                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `server` | Makes the Worker's `fetch` from the app, its Document, Loaders and server Layer: what the plugin's Worker entry runs; an app never calls it. |

### `@kestack/kabuki/start/client`

| Export   | What it does                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `client` | Hydrates a page the Worker drew, from the History it saved in it: what the plugin's browser entry runs; an app never calls it. |

## Usage

### A gate whose States decide what exists

This root signs a user in. While `Anonymous` it Provides `SignIn` and Invokes
`login`; while `Authenticated` it Provides `Session` and Invokes `todos`.

```ts
export const Auth = Actor.make('Auth', {
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
}).build({
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
      children: { login: Login },
      provides: (self) =>
        Layer.succeed(SignIn, {
          complete: (user) => self.send({ _tag: 'LoggedIn', user }),
        }),
      on: {
        LoggedIn: ({ user }) => ({ state: { _tag: 'Authenticated', user } }),
      },
    },
    Authenticated: {
      children: { todos: Todos },
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

- `make` takes only the Requires and the Schemas, which fix every type. `build` is checked against them: an Update that returns a State the Schema does not have, or a `state.user` read where there is none, does not compile.
- `build` has two Levels. What is written at the top holds for as long as the Instance lives; what is written in a State's block holds while that State lasts. Each Level can hold `provides`, `children`, `invoke`, `on` and `workers`.
- An Update that returns a different `_tag` is a Transition: the old State's Children, Workers and Capabilities stop, the new State's start. A Child written at the top lasts through it.
- A Worker is a named, scoped Effect given `self`: `send` to its own Instance, `get` and `changes` for its current data, and `now` for the app's Time. Written in the `Checking` block, `check` runs while that State lasts.
- Provides is one Layer per Level, built each time its Level starts. A Capability that reads the Model reads it through `self`, so it never goes stale. It cancels out what the Children below it need; a need nothing cancels bubbles up to the app's Layer.
- Requires caps the Actor's own code: a Worker, Command or Provide that reaches for anything else does not compile. Update and init never see Capabilities.

### A list of Actors, a Command, and a Worker per key

```ts
const save = Command.make('save', {
  args: Schema.Struct({ id: Schema.String }),
  run: () =>
    Effect.sleep('1 second').pipe(Effect.as({ _tag: 'Saved' as const })),
});

const List = Actor.make('List', {
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
}).build({
  init: () => ({ model: { ids: [], uploading: [], next: 0 } }),
  children: { rows: Actor.many(Row) },
  invoke: ({ model }) => ({
    rows: model.ids.map((id) => ({
      key: id,
      input: { text: `#${id}` },
      props: { uploading: model.uploading.includes(id) },
    })),
  }),
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

- `invoke` sits beside the `children` it feeds, and says which keys exist, the Input each new Child starts from, and the Props each is handed. After every Update, a new key Invokes a Row, a key gone stops it, and a key kept keeps its Instance. From then on the Row owns its data.
- Props are what the parent says now, worked out again after each of its Updates: the Row declares them with `props` beside `input`, and its Update, its Workers' Conditions and its View read them. It never writes them, and a change runs none of its rules. Props equal to the last ones keep the Instance; new ones are not in the History, since Replay works them out again from the parent.
- Instance IDs are deterministic: `List/rows[0]#1` is the first `rows` keyed `0`. A key Invoked again gets `#2`, so a Message meant for the old Instance is dropped.
- A Command is an errand, made once with `Command.make`: a name, the Schema of its args and the Effect it runs from them, ending with at most one Message. The Update asks for it with its args, `save({ id })`, which is plain data a test can compare; the args are checked when it runs. Nothing stops it but its Instance stopping, and there is no cancel. An Update may return a list of Commands; they run concurrently.
- A Worker runs for exactly as long as its Condition holds, read from the Model, State and Props whenever they change: where it is written, at the top or in a State, and within that always, `while` a test is true, or `each` key a function names, one Worker per key. Removing an id from `uploading` interrupts that upload and runs its finalizers; a finished upload Sends `Uploaded`, whose Update takes its key away. Stopping work is changing the Model.
- The Worker does the work and the Model keeps the story: every step the user could notice is a Message. A Worker must be able to start from the Model alone, because a resume or a start from an earlier History entry starts every Worker whose condition holds. A Worker that waits until a Time in the Model sleeps for `that - now`, so it waits only what is left. A finalizer never Sends.

### Drawing it with React

```tsx
export const AuthView = View.make(Auth, ({ _tag, state, children }) => {
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

const RowView = View.make(Row, ({ model, props, root }) => (
  <li {...root} data-uploading={props.uploading}>
    {model.text}
  </li>
));
const MotionRow = motion.create(RowView);

const DemoApp = toReact(Auth, AuthView, ServerLive);
```

- One function draws every State. It gets `_tag`, `model`, `state`, `props`, `children` (Handles; arrays for keyed Children, each with its `key`), `send` and `root`; a `switch` on `_tag` narrows `state` and `children`. The DOM stays across a Transition. It never sees Capabilities, so it draws a Replay exactly like the live app.
- A Child is placed with `<RowView instance={handle} />`. A parent View hands it only where to draw; data from the parent is the Row's Props, which the parent Actor hands it, so its Update and Workers see the same.
- Spreading `root` on the View's own element hands it the parent's `ref` and `style`, so `motion.create(RowView)` animates it, with no wrapper element, and it stays memoized. A View whose Instance has stopped keeps drawing its last data, so `AnimatePresence` can play its exit.
- A View re-renders only when its own Instance's Model, State, Props or set of Children changes, or its `ref` or `style` does. Many Messages handled in a row make one render.
- `DemoApp.useRuntime()` returns `{ history, branch, head, running, shown, show, start, stop, clear, workers, failure }` from anywhere on the page. Each `branch` entry is only its Envelope: `destination`, `message`, `at`, and `source`, the Instance that Sent it and what in it did; `history.outcome(id)` works out whether it was handled, ignored or dropped, and `history.snapshotAt(id)` takes the app apart there. `show(id)` draws the app right after that entry, on any Branch, while the live app runs on; `stop()` closes every Worker, Command and Capability; `start(id)` moves the Head to that entry and goes live there, growing a new Branch, and `start()` carries on from the Head, at its Time. `workers(id)` says what an Instance's Workers are doing live: running, finished, or failed. A start, stop or clear that fails, like the Runtime's first start or `start(id)` with no such entry, is logged with `console.error` and kept as `failure`, an Effect `Cause`, until one succeeds.
- Work that must survive a stop belongs in a Worker: Commands running at a stop are lost. The outside world is not rewound.
- What changes over time arrives as Messages: a Worker Sends a `Tick` or its progress, and the View draws the Model. motion can smooth what it draws from one Message to the next.
- `toReact` does not compile until the Layer covers every Capability the tree still needs.

### Drawing it before it runs

```tsx
const DemoApp = toReact(Auth, AuthView, ServerLive, { saved });
```

- The app is drawn before any Runtime exists: with no History, right after init; with a saved one, at its Head, replayed through Suspense. A server or a static build gets the same HTML the client hydrates, and `useRuntime` reads the saved History from the start, so a Timeline is drawn there too. Until the Runtime starts, a Send is dropped.
- `saved` is what `history.save()` gives: its entries and its Head, each Message, and each Instance of a Restore's Snapshot, written through its Actor's Schemas and read back through them on load. So the encoded side of every Schema must be JSON-safe, and then it is plain JSON: a `Date` as `Schema.DateFromString`, an `Option` as `Schema.OptionFromNullOr`. A saved History never changes, and one whose Head is not one of its entries fails to load. The Runtime carries on live at the Head, with Time going on from the Head's. `History.restored(Auth, snapshot, at).save()` makes the lightest one, a History of one Restore right after init, for an app that saves only its Snapshot; init stays the first Step. Where the History is kept is the app's business. Give `window` to keep only that many entries on the Head's Branch: the oldest kept becomes a Restore of the Snapshot right after it, and Time Travel reaches nothing before it. `history.keep(n)` changes it at any time, `history.keep(null)` stops Compacting. An app made with `toReact` remembers a Window changed that way in `localStorage` under its name, and starts from it after a reload, over the `window` it was given.
- When the last mount closes, the History is left under the app's name, the root Actor's by default, and the next mount of an app with that name carries on from it: the same component mounted again, or a new one after a hot reload, whose code replays the old Messages. A Message the new code handles differently warns and goes on. Give `name` when two apps share a root Actor and must not share a History; two apps of one name mounted at once is a console error.
