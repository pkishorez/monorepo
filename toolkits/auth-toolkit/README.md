# @kestack/auth-toolkit

One sign-in service on Cloudflare, the guard both sides of an Effect API import, and the Layers a web app or a device signs in with

## Big picture

One Cloudflare Worker, the Auth Worker, owns sign-in, sign-out and every
Sign-in, over a D1 Primary Database. It serves its own Home Page, Login
Screen, Device Screen and Consent Screen, so there is nothing else to deploy.
Every other program asks it "who is this?" instead of touching auth state.

A program reaches a User's data in one of three ways, and the doors follow
from that. A **Browser** is a web app on the Shared Cookie Domain; its
credential is the Auth Worker's cookie, which page code never reads. A
**Device** (a CLI, a TV or phone app) keeps its own Sign-in token. An
**OAuth** caller is someone else's program, such as an MCP client, holding an
Access Token after consent; the toolkit ships nothing for that side. The
root door is the contract both sides import: `Authz`, whose `required`,
`scope` and `policy` are the same for RPC and HttpApi, with `User` and the errors. `server` is its
server half, one `auth.rpc()` or `auth.http()` Layer per backend.
`client/browser` and `client/device` each provide the same `Accounts`
service, so app code does not care which one it runs on.

An agent or a preview signs in without Google as a Test User, whose email
ends in `.test`, through the Auth Worker's Test Sign-In; each backend admits
Test Users only with `testUsers: true`. An app whose whole backend runs in
the tab cannot reach an Auth Worker, so it uses the `fake` door instead:
`fakeAccounts` in place of `browser()` and `fakeGuard.rpc()` or
`fakeGuard.http()` in place of `auth.rpc()` or `auth.http()`. Handlers' tests
put a fixed Principal behind every call with `fakeGuard.rpc({ as })`. Under
the `kestack-fake-auth` export condition, which only development sets (the
Web Platform does under `pnpm dev`), `server`, `client/browser` and
`client/device` are the Fake themselves, so app code does not change. A Fake
Account's email must be at `kestack.test`; why is
[root ADR 0012](../../docs/adr/0012-pnpm-dev-signs-in-with-the-fake.md).

The Guard is Middleware from
[`@kestack/rpc-toolkit`](../rpc-toolkit/README.md), and the clients keep
their Accounts in [`@kestack/std-toolkit`](../std-toolkit/README.md) tables.
[`@kestack/web-platform`](../../platforms/web-platform) builds its Gate on
`Accounts`. The pages are a [`@kestack/kabuki`](../../packages/kabuki) app,
bundled into the `worker` door.

The words are in [`CONTEXT.md`](./CONTEXT.md), the decisions in
[`docs/adr/`](./docs/adr/) (the doors are
[ADR 0018](./docs/adr/0018-three-caller-kinds-four-doors.md), the one Guard
for both protocols
[ADR 0020](./docs/adr/0020-one-guard-for-both-protocols-as-authz.md), the Browser
rules [ADR 0019](./docs/adr/0019-browser-callers-are-same-site-and-never-hold-tokens.md),
Test Users and the fake
[ADR 0022](./docs/adr/0022-test-users-at-the-auth-worker-local-mode-becomes-the-fake.md),
the one server door [ADR 0023](./docs/adr/0023-one-server-door-guards-per-protocol.md)).
Every `authWorker` option is in
[`docs/auth-worker-configuration.md`](./docs/auth-worker-configuration.md),
the schema runbook in [`docs/migrations.md`](./docs/migrations.md), the
pages' design guidelines in [`docs/design.md`](./docs/design.md), and the
spec this shape was built from in [`docs/redesign.md`](./docs/redesign.md).

## Install

```sh
pnpm add @kestack/auth-toolkit
```

Peer dependencies, all optional; install the ones your doors need:

- `effect`: the root, `server`, `client/*` and `fake` doors are Effect values.
- `@kestack/rpc-toolkit`: the Guard is its Middleware, and the clients re-check through its `onExit`.
- `@kestack/std-toolkit`: `client/browser`, `client/device` and `fake` keep Accounts in its StdTable adapters.
- `better-sqlite3`: `worker/memory` runs SQLite in-process for tests.
- `alchemy` and `@alchemy.run/cloudflare`: `worker/alchemy` declares the D1 database in `alchemy.run.ts`.
- `react`: the pages are React. The `worker` door carries its own bundled copy, so a deployment does not need it installed.

## Exports

### `@kestack/auth-toolkit`

| Export                  | What it does                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `Authz.required`        | Guards an Rpc, RpcGroup, HttpApiEndpoint or HttpApiGroup: it runs only for a known caller.            |
| `Authz.scope`           | Guards it for an Access Token carrying every named Scope; `yield*` it to check in a handler.          |
| `Authz.policy`          | Guards it with an invariant and the reason it fails with; `yield*` it to check in a handler.          |
| `Authz.User`            | The Service a guarded handler reads the caller's Principal from.                                      |
| `Authz.Unauthenticated` | Error for a guarded call nobody signed (401); also its type.                                          |
| `Authz.Forbidden`       | Error for a call its policy refused (403); also its type.                                             |
| `Authz.Unavailable`     | Error when the Auth Worker could not be asked (503); also its type.                                   |
| `Authz.AccountChanged`  | Error for a Browser call whose `expect-user` is not the cookie's Active Account (409); also its type. |
| `Unauthenticated`       | `Authz.Unauthenticated` under its own name, for a published client's types.                           |
| `Forbidden`             | `Authz.Forbidden` under its own name.                                                                 |
| `Unavailable`           | `Authz.Unavailable` under its own name.                                                               |
| `AccountChanged`        | `Authz.AccountChanged` under its own name.                                                            |

### `@kestack/auth-toolkit/worker`

| Export       | What it does                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `authWorker` | Builds the Auth Worker: the better-auth instance and a fetch handler for the API, pages and assets. |
| `d1`         | Builds the Primary Database from a Cloudflare D1 binding.                                           |

### `@kestack/auth-toolkit/worker/memory`

| Export   | What it does                                                                        |
| -------- | ----------------------------------------------------------------------------------- |
| `memory` | Builds an in-memory SQLite Primary Database migrated with the shipped `.sql` files. |

### `@kestack/auth-toolkit/worker/alchemy`

| Export       | What it does                                                                   |
| ------------ | ------------------------------------------------------------------------------ |
| `d1Database` | Declares the D1 database as an Alchemy resource with the package's migrations. |

### `@kestack/auth-toolkit/server`

| Export      | What it does                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.rpc`  | The Guard's server half for Effect RPC: verifies each call against the Auth Worker; Test Users only with `testUsers: true`.                 |
| `auth.http` | The same for Effect HttpApi; with `oauth` it is a Resource Server and serves its Protected Resource Metadata.                               |
| `authAs`    | The Guard's server half for Effect RPC calls whose caller was found out before they arrived, such as over a socket verified at its upgrade. |
| `verify`    | Without Effect: resolves who a plain `Request` is from, or null (also for a Test User, unless `testUsers: true`).                           |

### `@kestack/auth-toolkit/client`

| Export                  | What it does                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `Accounts`              | The Service for who is signed in on this client: state, sign in, switch, sign out.                   |
| `AccountsState`         | The `Checking`, `SignedIn` (and its `switchingTo`) and `SignedOut` states, and `$match`.             |
| `AuthWorkerUnavailable` | Error when the Auth Worker could not be asked: unreachable, a server error, or an unreadable answer. |
| `AuthWorkerRejected`    | Error when the Auth Worker refused the request, with its reason.                                     |
| `DeviceLoginFailed`     | Error when a Device Login was denied, its code expired, or its Auth Worker moved.                    |
| `AccountLimitReached`   | Error when one more Account would pass the limit.                                                    |
| `TestSignInRefused`     | Error when the Auth Worker refused a Test User sign-in, with its code.                               |
| `TestSignInUnsupported` | Error when a Device is asked to sign a Test User in; only a Browser can.                             |

### `@kestack/auth-toolkit/client/browser`

| Export                 | What it does                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser`              | `Accounts` over the Auth Worker's cookie, plus the signing of every guarded call.                                                                                                                                      |
| `browserAccountsTable` | The StdTable the optional `cache` remembers the Accounts last signed in in, without tokens, so `state` starts `Checking { last }`; forgotten only by a sign-out asked here or a signed-out answer to that first check. |

### `@kestack/auth-toolkit/client/device`

| Export                | What it does                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `device`              | `Accounts` over stored Sign-in tokens, signing in by Device Login and every guarded call with a bearer. |
| `deviceAccountsTable` | The StdTable the Sign-in Store keeps each Account and its token in.                                     |

### `@kestack/auth-toolkit/fake`

| Export              | What it does                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `fakeAccounts`      | `Accounts` for the browser environment, with no Auth Worker, plus the signing of every guarded call.                       |
| `fakeChooser`       | A `choose` for `fakeAccounts` that a sign-in dialog answers.                                                               |
| `fakeAccountsTable` | The StdTable `fakeAccounts` keeps Fake Accounts in.                                                                        |
| `fakeGuard.rpc`     | The Guard's server half for Effect RPC that reads each call's Fake Token, or puts `as` behind every call, and asks no one. |
| `fakeGuard.http`    | The same for Effect HttpApi.                                                                                               |

## Usage

### A Browser app and its RPC backend

The contract guards `WhoAmI`; the backend at `api.example.com` serves it with
`auth.rpc({ url })`; the web app at `app.example.com` provides `browser({ url })`
and calls it. Lifted from `src/guard/server/tests/rpc.test.ts` and
`src/guard/client/browser/tests/browser.test.ts`.

```ts
// api.ts, imported by both sides
import { Authz } from '@kestack/auth-toolkit';
const WhoAmI = Rpc.make('WhoAmI', { success: Schema.String }).pipe(
  Authz.required,
);
export const Api = RpcGroup.make(WhoAmI);
export const Handlers = Api.toLayer({
  WhoAmI: () => Effect.map(Authz.User, ({ user }) => user.email),
});

// server.ts
import { server } from '@kestack/rpc-toolkit/rpc/http';
import { auth } from '@kestack/auth-toolkit/server';
const url = 'https://auth.example.com';
export default {
  fetch: server(Api, Layer.mergeAll(Handlers, auth.rpc({ url }))),
};

// app.ts
import { client } from '@kestack/rpc-toolkit/rpc/http';
import { Accounts } from '@kestack/auth-toolkit/client';
import { browser } from '@kestack/auth-toolkit/client/browser';
const whoAmI = Effect.gen(function* () {
  const state = yield* (yield* Accounts).check;
  if (state._tag === 'SignedOut') return yield* (yield* Accounts).signIn();
  const api = yield* RpcClient.make(Api);
  return yield* api.WhoAmI();
}).pipe(
  Effect.scoped,
  Effect.provide(client(Api, { url: 'https://api.example.com/rpc' })),
  Effect.provide(browser({ url })),
);
```

- The Auth Worker is `authWorker({ url, secret, google, database: d1(env.DB), cookieDomain: '.example.com', brand })`; every origin under `cookieDomain` is trusted and no other is.
- `browser` sends the cookie (`credentials: 'include'`) and an `expect-user` header naming the Active Account on every guarded call; the transport needs no options.
- When another tab switched Accounts, the backend fails the call `AccountChanged` before the handler runs, and `Accounts` checks again by itself.
- A Batched RPC Request is verified once, and the cookies the Auth Worker refreshed go on its response.
- `signIn()` leaves the page for the Login Screen and never completes in place.
- With `testUsers` on the Auth Worker, `signIn({ test: { email: 'tess@example.test', key } })` signs a Test User in without leaving the page, and the backend admits them only as `auth.rpc({ url, testUsers: true })`; `Authz.User`'s `test` says which Users they are.
- In the browser environment, `fakeAccounts({ choose })` replaces `browser({ url })` and `fakeGuard.rpc()` replaces `auth.rpc({ url })`; the contract and the app's calls stay the same.
- `switchTo(userId)` is a round trip: until it is confirmed the state is `SignedIn` with `switchingTo`, and calls still act as the Account before; one that fails leaves the state as it was and fails ([ADR 0021](./docs/adr/0021-an-account-switch-under-way-is-state.md)).

### A CLI signing in as a Device

`device` keeps each Account's Sign-in token in a StdTable the program
chooses; here SQLite, so the Accounts last between runs. Lifted from
`src/guard/client/device/tests/device.test.ts`.

```ts
import { client } from '@kestack/rpc-toolkit/rpc/http';
import { Accounts } from '@kestack/auth-toolkit/client';
import {
  device,
  deviceAccountsTable,
} from '@kestack/auth-toolkit/client/device';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';

const database = makeNodeSQLite({ path: `${homedir()}/.acme/auth.db` });
const accounts = device({
  url: 'https://auth.example.com',
  app: 'acme-cli',
  version: '1.4.0',
  storage: SQLite.make(deviceAccountsTable, { database }).layer,
});

const login = Effect.flatMap(Accounts, (accounts) =>
  accounts.signIn({ account: 'ada@example.com' }),
);

const whoAmI = Effect.gen(function* () {
  const api = yield* RpcClient.make(Api);
  return yield* api.WhoAmI();
}).pipe(
  Effect.scoped,
  Effect.provide(client(Api, { url: 'https://api.example.com/rpc' })),
);

// Remembered sign-ins: losing them costs a sign-in, never data.
await Effect.runPromise(
  SQLite.setup(deviceAccountsTable, { database, mode: 'disposable' }),
);
await Effect.runPromise(
  Effect.andThen(login, whoAmI).pipe(Effect.provide(accounts)),
);
```

- `signIn` prints a link to `/device?code=…&account=…` and its code, and opens the browser when `o` is pressed (`open: 'auto'` opens it at once; without a terminal it only prints). It completes once the User approves.
- Every guarded call carries the Active Account's token as a bearer. The same backend accepts it with no change: it is a Sign-in, not an Access Token ([ADR 0010](./docs/adr/0010-device-login-is-a-first-party-session.md)).
- The Device sends `acme-cli/1.4.0 (<hostname>)` as its User-Agent, so the Home Page lists it as "acme-cli on <hostname>".
- Start-up asks nobody: the stored Accounts are trusted until `check` or a refused call.
- A refused call fails at once, and is checked with the Auth Worker beside it, for five seconds at most. A sign-out revokes there for five seconds at most, finding the Auth Worker included, and forgets the token either way. An Auth Worker that stalls never holds a call or a sign-out.
- `url` may be an Effect, read at each call to the Auth Worker, for a Device whose Auth Worker can move: signing in, checks and sign-outs all go to the one it names then. A sign-in begun at an Auth Worker it has moved from fails `DeviceLoginFailed` with `reason: 'moved'` and keeps nothing.

### An MCP server with OAuth

An MCP server is one HttpApi endpoint behind `auth.http` with
`oauth`; its tools check Scopes inside. The Auth Worker lists the resource
under `oauth.resources`. Lifted from `src/guard/server/tests/http.test.ts`;
the MCP protocol itself is left out.

```ts
// the Auth Worker
authWorker({
  ...config,
  oauth: {
    resources: {
      'https://mcp.example.com/mcp': { 'notes:read': 'Read your notes' },
    },
  },
});

// the MCP server
import { Authz } from '@kestack/auth-toolkit';
import { auth } from '@kestack/auth-toolkit/server';

const resource = 'https://mcp.example.com/mcp';
const Mcp = HttpApiEndpoint.post('mcp', '/mcp', {
  success: Schema.String,
  error: Authz.Forbidden,
}).pipe(Authz.required);
class Api extends HttpApi.make('mcp-api').add(
  HttpApiGroup.make('mcp').add(Mcp),
) {}
const Handlers = HttpApiBuilder.group(Api, 'mcp', (handlers) =>
  handlers.handle('mcp', () =>
    Effect.gen(function* () {
      yield* Authz.scope('notes:read');
      return (yield* Authz.User).user.email;
    }),
  ),
);
export const App = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(Handlers),
  Layer.provide(
    auth.http({
      url: 'https://auth.example.com',
      oauth: { resource, scopes: ['notes:read'] },
    }),
  ),
);
```

- `auth.http` with `oauth` serves the Protected Resource Metadata at both RFC 9728 paths, readable from any origin, naming the Auth Worker as the issuer.
- A call without a token gets a 401 with the `WWW-Authenticate` challenge MCP clients follow; a missing Scope gets a 403 with `insufficient_scope`.
- Access Tokens are checked against the Auth Worker's keys, asking it nothing per call ([ADR 0007](./docs/adr/0007-access-tokens-are-verified-locally-against-jwks.md)). A token minted for another resource is refused.
- MCP clients register themselves; there is nothing to set up per client ([ADR 0009](./docs/adr/0009-mcp-clients-register-themselves.md)).
