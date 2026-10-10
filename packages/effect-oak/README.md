# effect-oak

An app as one tree of Actors outside React: each Actor a small state machine driven by Messages, one immutable Snapshot for the whole app, Effect running the work, and React only drawing it.

## Big picture

Effect Oak is the Elm architecture, as [Foldkit](https://github.com/foldkit/foldkit)
builds it on Effect, organized as a tree of Actors and drawn by React. Each
Actor is a state machine and an actor at once: Messages are the only way it
changes, and its State decides which Children it Invokes, which Capabilities
it Provides to them and which Lifetime runs. Leaving a State stops all of it.
Keyed Children follow the Model: a list of items can be a list of Actors.

The whole app is one immutable Snapshot, and handling a Message is a pure
function from one Snapshot to the next. There is one mailbox, and a Message is
handled before `send` returns. Around that pure core, everything that touches
the outside world is Effect: each Instance's work lives in nested Scopes, and
only the work where a Message landed is stopped or started. An Actor Requires
Capabilities from above; TypeScript points at any Child placed where they are
not Provided.

Every Message goes into the Log with its Time. The Log is a tree, like git
commits: Replay folds any path through `handle` to draw the app right after
any Message on any Branch, while the live app keeps running. The Runtime can
stop, and start again from any entry, growing a new Branch.

Read the language in [CONTEXT.md](./CONTEXT.md), the decisions in
[docs/adr/](./docs/adr/), and how the Log works in
[docs/log-tree.md](./docs/log-tree.md). Live demos are at `/demos/effect-oak` in the docs app.

## Install

```sh
pnpm add effect-oak effect react motion
```

- `effect`: Schemas describe Inputs, Models, States and Messages; Lifetimes, Commands and
  Capabilities are Effect values and Layers.
- `react`: `effect-oak/react` draws the tree with React components.
- `motion`: the Frame every View gets is a Framer Motion `MotionValue`.

## Exports

### `effect-oak`

| Export          | What it does                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Actor.make`    | Defines an Actor: Requires, Input, Schemas, Provides and Children. `.build` adds what runs it.                          |
| `Actor.many`    | Declares a keyed Child slot: one Instance of an Actor per key the parent Invokes.                                       |
| `Runtime.start` | Starts an Actor as the root of a running app, inside a Scope, with its Snapshot, Log, Time and `stop`, `start`, `show`. |
| `Replay.make`   | Rebuilds the Snapshot right after any Log entry from the Messages alone, yielding as it goes.                           |
| `init`          | The Snapshot right after init: the root and every Child its State Invokes.                                              |
| `handle`        | Applies one Envelope to a Snapshot and gives the next one, purely.                                                      |
| `instanceAt`    | Finds the Instance with an ID in a Snapshot.                                                                            |
| `isMany`        | Tells a keyed Child slot from a fixed one in an Instance's Children.                                                    |

### `effect-oak/react`

| Export      | What it does                                                                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `View.make` | Defines how one Actor is drawn, one function per State, as a React component that takes a Handle to the Instance.                                                                             |
| `toReact`   | Turns a root Actor, its View and a Layer into one React component that runs the whole app, one Runtime for every mount; `useRuntime` reads its Log, shows any entry, and stops and starts it. |

## Usage

### A gate whose States decide what exists

This root signs a user in. While `Anonymous` it Provides `SignIn` and Invokes
`login`; while `Authenticated` it Provides `Session` and Invokes `todos`.

```ts
export const Auth = Actor.make('Auth', {
  requires: { server: Server },
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
  provides: { Anonymous: [SignIn], Authenticated: [Session] },
  children: { Anonymous: { login: Login }, Authenticated: { todos: Todos } },
}).build({
  init: () => ({ state: { _tag: 'Checking' } }),
  lifetime: {
    Checking: (self) =>
      Effect.gen(function* () {
        const user = yield* (yield* Server).checkSession;
        yield* self.send({ _tag: 'CheckedSession', user });
      }),
  },
  update: {
    Checking: {
      CheckedSession: ({ user }) => ({
        state: user ? { _tag: 'Authenticated', user } : { _tag: 'Anonymous' },
      }),
    },
    Anonymous: {
      LoggedIn: ({ user }) => ({ state: { _tag: 'Authenticated', user } }),
    },
    Authenticated: { LoggedOut: () => ({ state: { _tag: 'Anonymous' } }) },
  },
  provides: {
    Anonymous: (self) =>
      Layer.succeed(SignIn, {
        complete: (user) => self.send({ _tag: 'LoggedIn', user }),
      }),
    Authenticated: (self) =>
      Layer.succeed(Session, {
        user: self.get.pipe(Effect.map(({ state }) => state.user)),
        logOut: self.send({ _tag: 'LoggedOut' }),
      }),
  },
});
```

- `make` is the statechart: it fixes every type and the shape of the tree. `build` is checked against it, so it must build every Capability `provides` declares.
- An Update that returns a different `_tag` is a Transition: the old State's Children, Lifetime and Capabilities stop, the new State's start.
- A Lifetime is a scoped Effect given `self`: `send` to its own Instance, and `get` and `changes` for its current data. `'*'` runs for as long as the Instance exists.
- Provides is a Layer built once each time the State is entered. A Capability that reads the Model reads it through `self`, so it never goes stale.
- Update and init never see Capabilities. Lifetimes and Commands get them from Effect (`yield* Server`).

### A list of Actors, and Commands under a key

```ts
const List = Actor.make('List', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    next: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    Added: {},
    Removed: { id: Schema.String },
    Saved: {},
  }),
  children: { rows: Actor.many(Row) },
}).build({
  init: () => ({ model: { ids: [], next: 0 } }),
  invoke: ({ model }) => ({
    rows: model.ids.map((id) => ({ key: id, input: { text: `#${id}` } })),
  }),
  update: {
    Added: (_, { model }) => ({
      model: { ids: [...model.ids, `${model.next}`], next: model.next + 1 },
      command: {
        key: 'save',
        run: Effect.sleep('1 second').pipe(
          Effect.as({ _tag: 'Saved' as const }),
        ),
      },
    }),
    Removed: ({ id }, { model }) => ({
      model: { ...model, ids: model.ids.filter((kept) => kept !== id) },
    }),
    Saved: () => ({}),
  },
});
```

- `invoke` says which keys exist and the Input each new Child starts from. After every Update, a new key Invokes a Row, a key gone stops it, and a key kept keeps its Instance. From then on the Row owns its data.
- Instance IDs are deterministic: `List/rows[0]#1` is the first `rows` keyed `0`. A key Invoked again gets `#2`, so a Message meant for the old Instance is dropped.
- A Command is owned by its Instance. Under a `key`, a new Command replaces the one still running, and `cancel: 'save'` interrupts it. A Command can be `(self) => Effect` and Send any number of Messages, such as one per chunk of a stream.

### Drawing it with React

```tsx
export const AuthView = View.make(Auth, {
  Checking: () => <Spinner />,
  Anonymous: ({ children }) => <LoginView node={children.login} />,
  Authenticated: ({ state, children }) => (
    <>
      <p>Signed in as {state.user}</p>
      <TodosView node={children.todos} />
    </>
  ),
});

const DemoApp = toReact(Auth, AuthView, ServerLive);
```

- A View is written per State, and gets `model`, `state`, `children` (Handles; arrays for keyed Children), `send` and `frame`. It never sees Capabilities, so it draws a Replay exactly like the live app.
- A View re-renders only when its own Instance's Model, State or set of Children changes. Many Messages handled in a row make one render.
- `DemoApp.useRuntime()` returns `{ log, head, running, shown, show, stop, start, children, frame }` from anywhere on the page. `show(id)` draws the app right after that entry, on any Branch; `stop()` closes every Lifetime, Command and Capability; `start(id)` Replays to that entry and grows a new Branch from it, and `start()` resumes.
- Work that must survive a stop belongs in a Lifetime: Commands running at a stop are lost. The outside world is not rewound.
- Whatever moves between Messages is drawn from `frame`, a `MotionValue<number>` holding the Time, with `useTransform`; nothing renders between Messages.
- `toReact` does not compile until the Layer covers every Capability the tree still needs.
