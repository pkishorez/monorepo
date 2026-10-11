# effect-oak

An app as one tree of Actors outside React: each Actor a small state machine driven by Messages, one immutable Snapshot for the whole app, Effect running the work, and React only drawing it.

## Big picture

Effect Oak is the Elm architecture, as [Foldkit](https://github.com/foldkit/foldkit)
builds it on Effect, organized as a tree of Actors and drawn by React. Each
Actor is a state machine and an actor at once: Messages are the only way it
changes, and its State decides which Children it Invokes, which Capabilities
it Provides to them and which Workers run. Leaving a State stops all of it.
Any fact in the Model can own a Worker too: an upload runs for as long as its
row says Uploading.
Keyed Children follow the Model: a list of items can be a list of Actors.

The whole app is one immutable Snapshot, and handling a Message is a pure
function from one Snapshot to the next. There is one mailbox, and a Message is
handled before `send` returns. Around that pure core, everything that touches
the outside world is Effect: each Instance's work lives in nested Scopes, and
only the work where a Message landed is stopped or started. An Actor's own
code reaches only the Capabilities it Requires. What its Children need bubbles
up until an ancestor Provides it, and the app does not compile until its Layer
covers the rest.

Every Message goes into the Log with its Time. The Log is a tree, like git
commits: Replay folds any path through `handle` to draw the app right after
any Message on any Branch, while the live app keeps running. The Runtime can
stop, and start again from any entry, growing a new Branch. The Log is also
what an app is saved as and drawn from before it runs: on a server, at build
time, and across a hot reload.

Read the language in [CONTEXT.md](./CONTEXT.md), the decisions in
[docs/adr/](./docs/adr/), and how the Log works in
[docs/log-tree.md](./docs/log-tree.md). Live demos are at `/demos/concepts` in the docs app: one per concept, drawn as moving shapes.

## Install

```sh
pnpm add effect-oak effect react motion
```

- `effect`: Schemas describe Inputs, Models, States and Messages, and every
  one is checked against its Schema as it is made; Workers, Commands and
  Capabilities are Effect values and Layers.
- `react`: `effect-oak/react` draws the tree with React components.
- `motion`: the Frame every View gets is a Framer Motion `MotionValue`.

## Exports

### `effect-oak`

| Export            | What it does                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Actor.make`      | Defines an Actor from its Requires and Schemas. `.build` adds how it behaves, at the top and in one block per State.    |
| `Actor.many`      | Declares a keyed Child slot: one Instance of an Actor per key the parent Invokes.                                       |
| `Runtime.start`   | Starts an Actor as the root of a running app, inside a Scope, with its Snapshot, Log, Time and `stop`, `start`, `show`. |
| `Replay.make`     | Rebuilds the Snapshot right after any Log entry from the Messages alone, yielding as it goes.                           |
| `Replay.fold`     | The Snapshot right after a Branch, played now with no yielding.                                                         |
| `Replay.restored` | The lightest Log an app can be saved as: one Restore of a Snapshot at a Time, right after init.                         |
| `restore`         | The Restore Message: given to the root, it replaces the whole Snapshot with a saved one, checked against the Actors.    |
| `isRestore`       | Tells a Restore from any other Message.                                                                                 |
| `RESTORE`         | The Restore Message's tag.                                                                                              |
| `Log`             | `Log.make` holds a Log as one value, empty or carrying on from a saved one, with its Branches and children.             |
| `init`            | The Snapshot right after init: the root and every Child its State Invokes.                                              |
| `handle`          | Applies one Envelope to a Snapshot and gives the next one, purely.                                                      |
| `instanceAt`      | Finds the Instance with an ID in a Snapshot.                                                                            |
| `isMany`          | Tells a keyed Child slot from a fixed one in an Instance's Children.                                                    |

### `effect-oak/react`

| Export      | What it does                                                                                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `View.make` | Defines how one Actor is drawn, one function for every State, as a React component that takes the Instance and data props from its parent.                                                                                                                          |
| `toReact`   | Turns a root Actor, its View and a Layer into one React component that runs the whole app, one Runtime for every mount; `useRuntime` reads its Log, shows any entry, and stops and starts it. Drawn before it runs, on a server too, from a saved Log if given one. |

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
    rows: model.ids.map((id) => ({ key: id, input: { text: `#${id}` } })),
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
        command: {
          name: 'save',
          run: Effect.sleep('1 second').pipe(
            Effect.as({ _tag: 'Saved' as const }),
          ),
        },
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

- `invoke` sits beside the `children` it feeds, and says which keys exist and the Input each new Child starts from. After every Update, a new key Invokes a Row, a key gone stops it, and a key kept keeps its Instance. From then on the Row owns its data.
- Instance IDs are deterministic: `List/rows[0]#1` is the first `rows` keyed `0`. A key Invoked again gets `#2`, so a Message meant for the old Instance is dropped.
- A Command is an errand: one named Effect that ends with at most one Message. Nothing stops it but its Instance stopping, and there is no cancel. An Update may return a list of Commands; they run concurrently.
- A Worker runs for exactly as long as its Condition holds, read from the Model and State after every Update: its Level, and within it always, `while` a test is true, or `each` key a function names, one Worker per key. Removing an id from `uploading` interrupts that upload and runs its finalizers; a finished upload Sends `Uploaded`, whose Update takes its key away. Stopping work is changing the Model.
- The Worker does the work and the Model keeps the story: every step the user could notice is a Message. A Worker must be able to start from the Model alone, because a resume or a start from an earlier Log entry starts every Worker whose condition holds. A Worker that waits until a Time in the Model sleeps for `that - now`, so it waits only what is left. A finalizer never Sends.

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

const RowView = View.make(
  Row,
  ({ model, root }, { selected }: { readonly selected: boolean }) => (
    <li {...root} data-selected={selected}>
      {model.text}
    </li>
  ),
);
const MotionRow = motion.create(RowView);

const DemoApp = toReact(Auth, AuthView, ServerLive);
```

- One function draws every State. It gets `_tag`, `model`, `state`, `children` (Handles; arrays for keyed Children, each with its `key`), `send`, `frame` and `root`; a `switch` on `_tag` narrows `state` and `children`. The DOM stays across a Transition. It never sees Capabilities, so it draws a Replay exactly like the live app.
- A Child is placed with `<RowView instance={handle} />`. Its draw's second parameter is data from the parent (`selected` above), for drawing only: a function prop is a type error, and what a View does goes through a Message.
- Spreading `root` on the View's own element hands it the parent's `ref` and `style`, so `motion.create(RowView)` animates it, with no wrapper element, and it stays memoized. A View whose Instance has stopped keeps drawing its last data, so `AnimatePresence` can play its exit.
- A View re-renders only when its own Instance's Model, State or set of Children changes, or its props do. Many Messages handled in a row make one render.
- `DemoApp.useRuntime()` returns `{ log, head, running, shown, show, stop, start, children, workers, frame }` from anywhere on the page. `show(id)` draws the app right after that entry, on any Branch; `stop()` closes every Worker, Command and Capability; `start(id)` Replays to that entry and grows a new Branch from it, and `start()` resumes. `workers(id)` says what an Instance's Workers are doing live: running, finished, or failed.
- Work that must survive a stop belongs in a Worker: Commands running at a stop are lost. The outside world is not rewound.
- Whatever moves between Messages is drawn from `frame`, a `MotionValue<number>` holding the Time, with `useTransform`; nothing renders between Messages.
- `toReact` does not compile until the Layer covers every Capability the tree still needs.

### Drawing it before it runs

```tsx
const DemoApp = toReact(Auth, AuthView, ServerLive, { saved });
```

- The app is drawn before any Runtime exists: with no Log, right after init; with a saved Log, at its Head or at the entry it was showing, Replayed through Suspense. A server or a static build gets the same HTML the client hydrates, and `useRuntime` reads the saved Log from the start, so a Timeline is drawn there too. Until the Runtime starts, a Send is dropped.
- `saved` is a `RuntimeState`, what `useRuntime` and `Running.state()` give: plain JSON. The Runtime carries on as it says: live at its Head with Time going on from there, stopped, or showing an entry. `Replay.restored(definition, snapshot, at)` makes the lightest one, a Log of one Restore right after init, for an app that saves only its Snapshot; init stays the first Step. Where the Log is kept is the app's business.
- When the last mount closes, the Log is left under the app's name, the root Actor's by default, and the next mount of an app with that name carries on from it: the same component mounted again, or a new one after a hot reload, whose code Replays the old Messages. A Message the new code handles differently warns and goes on. Give `name` when two apps share a root Actor and must not share a Log; two apps of one name mounted at once is a console error.
