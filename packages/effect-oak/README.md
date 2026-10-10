# effect-oak

An app as one tree of Nodes outside React: each Node a small state machine driven by Messages, Effect running the work, and React only drawing it.

## Big picture

Effect Oak is the Elm architecture, as [Foldkit](https://github.com/foldkit/foldkit)
builds it on Effect, but drawn by React. All app state lives in one tree of
Nodes outside React, and only a Node's Update changes it. A Node's States
are a Schema union, so every Node is a small state machine: the State decides
which Children exist, which Services the Node Provides to them, and which
Lifetime runs. Leaving a State destroys all of it at once.

A Node Requires Services from above. Each Child must find every Service it
needs in its parent's Requires, or among what the parent Provides in that
State; TypeScript points at the Child that does not fit. The root's Requires
must be covered by the app's Layer. Views draw and Send; whatever moves
between Messages they draw from the Frame, a motion value holding the Time.
Every Message goes into the Log with its Time. The Log is a tree, like git
commits: replaying a path through init and Update alone draws the app right
after any Message on any Branch, while the live app keeps running. The Runtime
can stop, and start again from any entry, growing a new Branch beside the old.

Read the language in [CONTEXT.md](./CONTEXT.md) and the decisions in
[docs/adr/](./docs/adr/), and how the Log works in
[docs/log-tree.md](./docs/log-tree.md). A live demo is at `/demos/effect-oak` in the docs app.

## Install

```sh
pnpm add effect-oak effect react motion
```

- `effect`: Schemas describe Models, States and Messages; Commands, Lifetimes and
  Services are Effect values.
- `react`: `effect-oak/react` draws the tree with React components.
- `motion`: the Frame every View gets is a Framer Motion `MotionValue`.

## Exports

### `effect-oak`

| Export          | What it does                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Node.make`     | Defines a Node: Requires, Schemas, Provides and Children. `.build` adds what runs it.                                                     |
| `Runtime.start` | Starts a Node as the root of a running app, inside a Scope, and returns its live root, its Time, its Log, and `stop`, `start` and `show`. |
| `Replay.make`   | Rebuilds a Node's tree right after the last entry of a Branch, running only init and Update.                                              |

### `effect-oak/react`

| Export      | What it does                                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `View.make` | Defines how one Node is drawn, as a React component that takes the live Node to draw and the Frame.                                                                                          |
| `toReact`   | Turns a root Node, its View and a Layer into one React component that runs the whole app, one Runtime for every mount; `useRuntime` reads its Log, shows any entry, and stops and starts it. |

## Usage

### A gate whose States decide what exists

This root signs a user in. While `Anonymous` it Provides
`SignIn` and has a `login` Child; while `Authenticated` it Provides `Session`
and has `api` and `expiry` Children.

```ts
export const Auth = Node.make('Auth', {
  requires: { server: Server },
  state: Schema.TaggedUnion({
    Checking: {},
    Anonymous: {},
    Authenticated: { user: Schema.String, token: Schema.String },
  }),
  message: Schema.TaggedUnion({
    CheckedSession: { session: Schema.NullOr(Credentials) },
    LoggedIn: { user: Schema.String, token: Schema.String },
    LoggedOut: {},
  }),
  provides: { Anonymous: [SignIn], Authenticated: [Session] },
  children: {
    Anonymous: { login: Login },
    Authenticated: { api: Api, expiry: Expiry },
  },
}).build({
  init: () => ({ state: { _tag: 'Checking' } }),
  lifetime: {
    Checking: () =>
      Stream.fromEffect(
        Effect.gen(function* () {
          return yield* (yield* Server).checkSession;
        }),
      ).pipe(
        Stream.map((session) => ({ _tag: 'CheckedSession' as const, session })),
      ),
  },
  update: {
    Checking: {
      CheckedSession: ({ session }) => ({
        state: session
          ? { _tag: 'Authenticated', ...session }
          : { _tag: 'Anonymous' },
      }),
    },
    Anonymous: {
      LoggedIn: ({ user, token }) => ({
        state: { _tag: 'Authenticated', user, token },
      }),
    },
    Authenticated: { LoggedOut: () => ({ state: { _tag: 'Anonymous' } }) },
  },
  provides: {
    Anonymous: ({ send }) =>
      Context.make(SignIn, {
        complete: (credentials) => send({ _tag: 'LoggedIn', ...credentials }),
      }),
    Authenticated: ({ state, send }) =>
      Context.make(Session, {
        user: state.user,
        token: state.token,
        logOut: () => send({ _tag: 'LoggedOut' }),
      }),
  },
});
```

- `make` is the statechart: it fixes every type and the shape of the tree. `build` is checked against it, so it must build every Service `provides` declares.
- An Update that returns a different `_tag` is a Transition: the old State's Children and Lifetime stop, the new State's start.
- A Child that Requires `Session` can only live under `Authenticated`; anywhere else, its line in `children` does not compile.
- Update and init never see Services. Commands and Lifetimes get them from Effect (`yield* Server`), and only `provides` reads them directly.

### Drawing it with React

```tsx
export const AuthView = View.make(Auth, {
  Checking: () => <Spinner />,
  Anonymous: ({ children }) => <LoginView node={children.login} />,
  Authenticated: ({ state, children }) => (
    <>
      <p>Signed in as {state.user}</p>
      <ExpiryView node={children.expiry} />
      <ApiView node={children.api} />
    </>
  ),
});

const DemoApp = toReact(Auth, AuthView, ServerLive);
```

- A View is written per State, and each one sees only the Children of its State.
- Each View re-renders only when its own Instance's Model or State changes. A View takes only `node`; its draw also gets `frame`, which `toReact` provides through context.
- `DemoApp.useRuntime()` returns `{ log, head, running, shown, show, stop, start, children, frame }` from anywhere on the page. `log` is the current Branch, each entry with its id, its Time and what came of it; `children(id)` lists the entries after one, to draw the tree.
- `show(id)` draws the app right after that entry, on any Branch, at its Time; `show(null)` goes back to live. The live app keeps running meanwhile, and the past cannot Send.
- `stop()` interrupts every Command and Lifetime; the Frame stands still and nothing can Send. `start()` resumes. `start(id)` Replays the path to that entry and goes live from there, growing a new Branch; `start(null)` starts from right after init. Time carries on from the entry's Time.
- Work that must survive a stop belongs in a Lifetime: Commands running at a stop are lost, and init's Commands never run again. A first fetch is a Lifetime.
- The outside world is not rewound: starting from an old entry rebuilds the app, not the server, the socket or localStorage.
- Every mount of `DemoApp` shows the same Runtime. The first mount starts it and the last unmount stops it; a Runtime stopped by hand stays stopped until the mounts drop to zero and rise again.

### Motion between Messages

The docs demo is a road: dividers scroll and the car slides between lanes,
yet a minute of driving is a handful of Messages. Update records what is
happening and since when, using the Message's Time. The View turns the Frame
into positions with `useTransform`, so nothing renders between Messages.

```tsx
// Update: the car heads for a lane from where it is now.
Steered: ({ toward }, { model: { config }, state, at }) => {
  const to = Math.min(config.lanes - 1, Math.max(0, state.lane.to + (toward === 'left' ? -1 : 1)));
  if (to === state.lane.to) return {};
  return { state: { ...state, lane: { from: laneAt(state.lane, config, at), to, at } } };
},

// View: where things are at a Frame, in road units.
Playing: ({ model: { config }, state, frame }) => (
  <Scene road={config} frame={frame} where={(at) => whereAt(config, state, at)} />
),

// Scene: motion values follow the Frame, with no render.
const now = useTransform(frame, where);
const shift = useTransform(now, ({ driven }) => dividerShift(road, driven));
const x = useTransform(now, ({ lane }) => carAt(road, lane).x);
return (
  <svg viewBox={viewBox}>
    <motion.g style={{ y: shift }}>{dividers}</motion.g>
    <motion.g style={{ x, y: carY }}>{car}</motion.g>
  </svg>
);
```

- Update gets each Message's Time as `at`. The Runtime stamps it when the Message is sent, from Effect's `Clock`, and Replay gives Update the same `at`.
- `frame` is one `MotionValue<number>` for the whole app, and every View's draw gets it. Outside a running app it stands still at 0. Live, it follows the Runtime's Time at every animation frame; at a Step it stands still at that Message's Time. React renders only when a Message changes the Model, and `useTransform` recomputes during that render, so a new Model never shows at an old position.
- A canvas listens instead: `useMotionValueEvent(frame, 'change', (at) => draw(at))`, plus one draw at `frame.get()` when it mounts.
- There is no Pause. An app that must stand still, like a game, pauses itself with its own Messages; the road keeps a Paused State.
- Commands and Lifetimes sleep on Effect's Clock. An Update returning `replaceCommands: true` stops its Node's Commands still running first: the demo replans its crash this way every time you steer.
- Each State is drawn by its own component, so a State's draw can use hooks.
- `toReact` does not compile until the Layer covers every Service the tree still needs.
