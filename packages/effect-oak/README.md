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
between Messages they draw at each Frame, from the Model, State and Time.
Every Message goes into a Log with its Time, and replaying it through init and
Update alone draws the app at any Time while the live app keeps running.

Read the language in [CONTEXT.md](./CONTEXT.md) and the decisions in
[docs/adr/](./docs/adr/). A live demo is at `/demos/effect-oak` in the docs app.

## Install

```sh
pnpm add effect-oak effect react
```

- `effect`: Schemas describe Models, States and Messages; Commands, Lifetimes and
  Services are Effect values.
- `react`: `effect-oak/react` draws the tree with React components.

## Exports

### `effect-oak`

| Export          | What it does                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `Node.make`     | Defines a Node: Requires, Schemas, Provides and Children. `.build` adds what runs it.                        |
| `Runtime.start` | Starts a Node as the root of a running app, inside a Scope, and returns its live root, its Time and its Log. |
| `Replay.make`   | Rebuilds a Node's tree at any Time from its Messages, running only init and Update.                          |

### `effect-oak/react`

| Export      | What it does                                                                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `View.make` | Defines how one Node is drawn, as a React component that takes the live Node to draw.                                                                                                                            |
| `toReact`   | Turns a root Node, its View and a Layer into one React component that runs the whole app; `useRoot` reads its live root; `useLog` reads its Log; `useTimeTravel` has its Messages and shows the app at any Time. |

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
- Each View re-renders only when its own Instance's Model or State changes.
- `DemoApp.useLog()` returns every Message with what came of it and its Time. `DemoApp.useTimeTravel()` returns `{ messages, at, paused, now, travel, pause, resume }`: the Messages with their Times, and the Time the Views show. `pause()` stops the app's Time, `travel(1500)` then draws it as it was 1.5 s after it started, and `resume()` carries on live from where it stopped. The past cannot send.

### Motion between Messages

The docs demo is a road: dividers scroll and the car slides between lanes,
yet a minute of driving is a handful of Messages. Update records what is
happening and since when, using the Message's Time. The View works out where
things are at every Frame and moves them through refs, without rendering.

```tsx
// Update: the car heads for a lane from where it is now.
Steered: ({ toward }, { model: { config }, state, at }) => {
  const to = Math.min(config.lanes - 1, Math.max(0, state.lane.to + (toward === 'left' ? -1 : 1)));
  if (to === state.lane.to) return {};
  return { state: { ...state, lane: { from: laneAt(state.lane, config, at), to, at } } };
},

// View: where things are at a Frame, in road units.
Playing: ({ model: { config }, state, useFrame }) => (
  <Scene
    config={config}
    useFrame={useFrame}
    where={(at) => ({
      driven: ((at - state.startedAt) / 1000) * config.speed,
      lane: laneAt(state.lane, config, at),
    })}
  />
),

// Scene: turn that into SVG through refs, with no render.
useFrame((at) => {
  const { driven, lane } = where(at);
  const { x, y } = carAt(config, lane);
  dividers.current?.setAttribute('transform', `translate(0 ${dividerShift(config, driven)})`);
  car.current?.setAttribute('transform', `translate(${x} ${y})`);
});
```

- Update gets each Message's Time as `at`. The Runtime stamps it when the Message is sent, from Effect's `Clock`, so Replay sees the same Time.
- `useFrame` calls back live at every animation frame, and during Time Travel at every move of the timeline. React renders only when a Message changes the Model.
- No animation frame is requested while no View uses `useFrame`.
- Each State is drawn by its own component, so a State's draw can use hooks.
- `toReact` does not compile until the Layer covers every Service the tree still needs.
