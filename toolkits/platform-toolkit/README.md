# @kstackz/platform-toolkit

Running an app on any platform: its named APIs on a cloud or a device Backend, several Accounts signed in on one device with one Session each, and its cache. The Web and Expo Platforms are built on it.

## Big picture

Every app runs the same way on every device. It has named APIs, a cloud
Backend and maybe a device Backend that answer them, Accounts that sign in,
one Session for the active Account, and a Cache of what only the device keeps.
This Package holds those rules once, with nothing of the web or of Expo in it.
The Web Platform and the Expo Platform each give it a Host and call its
`createApp`; an app calls its Platform's `createApp`, not this one.

The Gate is the heart of it. It keeps the app on one Backend, remembers the
Accounts there, opens the active Account's Session at once (Open First) and
confirms it behind, and holds the app on an Account Lost until the User acts.
Each Session is written once with `defineSession`, as a function of the
Session Context. Closing a Session interrupts every call still in flight, so
nothing of one Account reaches another's screen.

It builds on the area Toolkits: rpc-toolkit's Transports for each API,
auth-toolkit's Sign-in mechanisms and Guard, and std-toolkit's tables and Std
Sync for what the device keeps. Why the Gate and `createApp` moved here out of
auth-toolkit is [ADR 0006](../../docs/adr/0006-platforms-may-break-toolkits-keep-what-persists.md).
The words are in [`CONTEXT.md`](./CONTEXT.md).

## Install

```sh
pnpm add @kstackz/platform-toolkit
```

Peer dependencies:

- `@kstackz/rpc-toolkit`: each API is called with its `http`, `websocket` and `inProcess` Transports.
- `@kstackz/auth-toolkit`: Accounts sign in through its `SignIn` Service, `signIn.named` on the device Backend, and calls are signed with its Guard.
- `@kstackz/std-toolkit`: the Gate's memory, Named Accounts and the Cache are its tables; each user's data is its Std Sync.
- `effect`: Sessions, Sign-ins and Backends are Effects and Layers.
- `react`: `createApp` and `gateReact` return `SignedIn`, `SignedOut` and hooks.

## Exports

### `@kstackz/platform-toolkit`

| Export          | What it does                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `createApp`     | An app from a Host, its APIs, a device Backend, auth with its Session, and a Cache: the Gate, its React side, hooks. |
| `Api.http`      | Declares an API reached over HTTP at a path or full URL.                                                             |
| `Api.websocket` | Declares an API reached over a WebSocket at a path or full URL.                                                      |
| `defineSession` | Writes an app's Session once over its APIs, with its Service and hooks.                                              |
| `SessionClosed` | Error a run rejects with when its Session closed first.                                                              |
| `createGate`    | The Gate on its own, underneath `createApp`.                                                                         |
| `gateReact`     | A Gate's `SignedIn`, `SignedOut` and hooks.                                                                          |
| `memoryHost`    | A Host kept in memory, with no network events and no other tabs, for tests.                                          |
| `Backend`       | The Schema of the two Backends, `cloud` and `device`.                                                                |
| `backendNamed`  | The Backend a stored or launched name means, including the former `remote` and `local`.                              |
| `syncName`      | The name of one user's Std Sync on the device.                                                                       |
| `keepSyncs`     | Deletes every user's Std Sync on the device but the ones still signed in.                                            |

## Usage

### An app with Accounts on the device Backend

The Session is written once with `defineSession` and given to `createApp` as
`auth.session`. Lifted from `src/app/tests/app.test.ts`.

```ts
import {
  Api,
  createApp,
  defineSession,
  memoryHost,
  SessionClosed,
} from '@kstackz/platform-toolkit';

const apis = {
  ledger: Api.http(Ledger, { path: '/rpc' }),
  public: Api.http(Public, { path: '/public' }),
};

// Every API's handlers, run on the device, each call checked by its token.
const device = () => ({
  ledger: Ledger.toLayer({
    WhoAmI: () => Effect.map(Authz.Current, ({ user }) => user.email),
    Slow: () => Effect.promise(() => answer.slow.promise),
  }).pipe(Layer.merge(authz.layer), Layer.provide(authz.device)),
  public: Public.toLayer({ Hello: () => Effect.succeed('hello') }),
});

const session = defineSession(apis, ({ apis }) =>
  Effect.succeed({ whoAmI: apis.ledger.WhoAmI(), hello: apis.public.Hello() }),
);
const app = createApp({
  host: () => memoryHost(),
  apis,
  device,
  auth: { session },
});

const { gate } = app;
await gate.setBackend('device');
gate.subscribe(() => {});
const added = gate.addAccount();
gate.namedSignIn.answer({ email: 'ada@demo' });
await added;

// opened = the Session once gate.view().kind is 'open'
expect(await Effect.runPromise(opened.value.whoAmI)).toBe('ada@demo');
const slow = opened.run(opened.apis.ledger.Slow());
gate.signOut();
await expect(slow).rejects.toBeInstanceOf(SessionClosed);
```

- `host` is a function, so nothing runs until a screen or test first asks. A Platform gives its own Host; `memoryHost` is for tests.
- On the cloud Backend each API is called at its path against the Host's cloud address, with the Account's token and never a cookie. On the device Backend it is called in this process, and Users sign in by name.
- A Session's `sync` is named for the user by `syncName`. On the cloud Backend it is kept in the Host's Storage, and `keepSyncs` deletes it once the user is no longer signed in.
- Under `SignedIn`, screens read the Session with `useSession`, run Effects with `useRun`, and see the Session Status with `useStatus`. `useApi` calls an API as the open Account, or as nobody outside `SignedIn`.

### The Gate on its own

`createGate` is what `createApp` runs: a Host, a Sign-in per Backend, and how
one Account's Session opens. Lifted from `src/gate/tests/gate.test.ts`.

```ts
import { createGate, memoryHost } from '@kstackz/platform-toolkit';

const gate = createGate<Opened, never>({
  host: () => memoryHost({ online: () => state.online }),
  cloud: () => auth, // a Layer of auth-toolkit's SignIn
  device: async () => auth,
  session: (account, token) =>
    Effect.acquireRelease(
      Effect.sync(() => ({ id: account.user.id, token })),
      (opened) => Effect.sync(() => state.log.push(`close ${opened.id}`)),
    ),
  keep: (ids) => Effect.sync(() => state.kept.push([...ids])),
});

// Something asks, so the Gate starts, on what the device remembers.
gate.subscribe(() => {});
await vi.waitFor(() => expect(gate.view().kind).toBe('open'));
gate.switchTo('ada');
```

- `view()` is what the app shows: `checking`, `opening`, `open`, `signedOut`, `signingOut`, `unopenable` or `accountLost`.
- Remembered Accounts live in the Host's `gate` database, table `auth-gate`, so a launch opens the active one before its Sign-in answers.
- `gateReact(gate)` turns it into `SignedIn`, `SignedOut` and hooks for React.
