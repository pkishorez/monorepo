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
must be covered by the app's Layer. Views only draw and Send: no hooks, no
effects, no state. Every Message goes into a Log, and replaying it through
init and Update alone draws the app at any point while the live app keeps
running.

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

| Export          | What it does                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `Node.make`     | Defines a Node: Requires, Schemas, Provides and Children. `.build` adds what runs it.              |
| `Runtime.start` | Starts a Node as the root of a running app, inside a Scope, and returns its live root and its Log. |
| `Replay.make`   | Rebuilds a Node's tree after any number of its Messages, running only init and Update.             |

### `effect-oak/react`

| Export      | What it does                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `View.make` | Defines how one Node is drawn, as a React component that takes the live Node to draw.                                                                                           |
| `toReact`   | Turns a root Node, its View and a Layer into one React component that runs the whole app; `useLog` reads its Log; `useTimeTravel` has its Messages and shows any point of them. |

## Usage

### A gate whose States decide what exists

The root of the docs demo signs a user in. While `Anonymous` it Provides
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
- `DemoApp.useLog()` returns every Message with what came of it and when. `DemoApp.useTimeTravel()` returns `{ messages, at, travel }`: only the Messages, and where the Views are. `travel(0)` draws the app right after init, `travel(42)` after 42 Messages, `travel(null)` live again. The app keeps running meanwhile, and the past cannot send.
- `toReact` does not compile until the Layer covers every Service the tree still needs.
