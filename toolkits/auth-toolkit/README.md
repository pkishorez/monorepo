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
root door is the contract both sides import, `Auth`. `server/rpc` and
`server/http` are its server half, one `auth()` value per backend.
`client/browser` and `client/device` each provide the same `Accounts`
service, so app code does not care which one it runs on.

The Guard is Middleware from
[`@kestack/rpc-toolkit`](../rpc-toolkit/README.md), and the clients keep
their Accounts in [`@kestack/std-toolkit`](../std-toolkit/README.md) tables.
[`@kestack/web-platform`](../../platforms/web-platform) builds its Gate on
`Accounts`. The pages are a [`@kestack/kabuki`](../../packages/kabuki) app,
bundled into the `worker` door.

The words are in [`CONTEXT.md`](./CONTEXT.md), the decisions in
[`docs/adr/`](./docs/adr/) (the doors are
[ADR 0018](./docs/adr/0018-three-caller-kinds-four-doors.md), the Browser
rules [ADR 0019](./docs/adr/0019-browser-callers-are-same-site-and-never-hold-tokens.md)).
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

- `effect`: the root, `server/*` and `client/*` doors are Effect values.
- `@kestack/rpc-toolkit`: the Guard is its Middleware, and the clients re-check through its `Rpc.onExit`.
- `@kestack/std-toolkit`: `client/browser` and `client/device` keep Accounts in its StdTable adapters.
- `better-sqlite3`: `worker/memory` runs SQLite in-process for tests.
- `alchemy`: `worker/alchemy` declares the D1 database in `alchemy.run.ts`.
- `react`: the pages are React. The `worker` door carries its own bundled copy, so a deployment does not need it installed.

## Exports

### `@kestack/auth-toolkit`

| Export                 | What it does                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `Auth.required`        | Guards an Rpc, RpcGroup, HttpApiEndpoint or HttpApiGroup: it runs only for a known caller.   |
| `Auth.scope`           | Guards it for an Access Token carrying every named Scope; `yield*` it to check in a handler. |
| `Auth.policy`          | Guards it with an invariant and the reason it fails with; `yield*` it to check in a handler. |
| `Auth.User`            | The Service a guarded handler reads the caller's Principal from.                             |
| `Auth.Unauthenticated` | Error for a guarded call nobody signed (401).                                                |
| `Auth.Forbidden`       | Error for a call its policy refused (403).                                                   |
| `Auth.Unavailable`     | Error when the Auth Worker could not be asked (503).                                         |
| `Auth.AccountChanged`  | Error for a Browser call whose `expect-user` is not the cookie's Active Account (409).       |

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

### `@kestack/auth-toolkit/server/rpc`

| Export     | What it does                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `auth`     | The Guard's server half for Effect RPC: verifies each call against the Auth Worker, or in Local mode. |
| `testAuth` | The same Layer with a fixed Principal (or nobody) behind every call, for handlers' tests.             |

### `@kestack/auth-toolkit/server/http`

| Export     | What it does                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `auth`     | The Guard's server half for Effect HttpApi; with `oauth` it is a Resource Server and serves its Protected Resource Metadata. |
| `testAuth` | The same Layer with a fixed Principal (or nobody) behind every call, for handlers' tests.                                    |
| `verify`   | Without Effect: resolves who a plain `Request` is from, or null.                                                             |

### `@kestack/auth-toolkit/client`

| Export                      | What it does                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `Accounts`                  | The Service for who is signed in on this client: state, sign in, switch, sign out.       |
| `AccountsState`             | The `Checking`, `SignedIn` and `SignedOut` states, with their constructors and `$match`. |
| `AuthWorkerUnreachable`     | Error when the Auth Worker could not be reached at all.                                  |
| `AuthWorkerUnavailable`     | Error when the Auth Worker answered with a server error.                                 |
| `AuthWorkerRejected`        | Error when the Auth Worker refused the request, with its reason.                         |
| `InvalidAuthWorkerResponse` | Error when the Auth Worker's answer could not be read.                                   |
| `DeviceLoginFailed`         | Error when a Device Login was denied or its code expired.                                |
| `AccountLimitReached`       | Error when one more Account would pass the limit.                                        |

### `@kestack/auth-toolkit/client/browser`

| Export                 | What it does                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `browser`              | `Accounts` over the Auth Worker's cookie, plus the signing of every guarded call; or Local mode. |
| `browserAccountsTable` | The StdTable the optional `cache` keeps the last-known Accounts in, without tokens.              |
| `localAccountsTable`   | The StdTable Local mode keeps Local Accounts in.                                                 |
| `localChooser`         | A Local mode `choose` that a sign-in dialog answers.                                             |

### `@kestack/auth-toolkit/client/device`

| Export                | What it does                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `device`              | `Accounts` over stored Sign-in tokens, signing in by Device Login and every guarded call with a bearer. |
| `deviceAccountsTable` | The StdTable the Sign-in Store keeps each Account and its token in.                                     |

## Usage

### A Browser app and its RPC backend

The contract guards `WhoAmI`; the backend at `api.example.com` serves it with
`auth({ url })`; the web app at `app.example.com` provides `browser({ url })`
and calls it. Lifted from `src/server/rpc/tests/rpc.test.ts` and
`src/client/browser/tests/browser.test.ts`.

```ts
// api.ts, imported by both sides
const WhoAmI = Rpc.make('WhoAmI', { success: Schema.String }).pipe(
  Auth.required,
);
export const Api = RpcGroup.make(WhoAmI);
export const Handlers = Api.toLayer({
  WhoAmI: () => Effect.map(Auth.User, ({ user }) => user.email),
});

// server.ts
import { Rpc as Rpcs } from '@kestack/rpc-toolkit/rpc';
import { auth } from '@kestack/auth-toolkit/server/rpc';
const url = 'https://auth.example.com';
export default {
  fetch: Rpcs.http.server(Api, Layer.mergeAll(Handlers, auth({ url }))),
};

// app.ts
import { Accounts } from '@kestack/auth-toolkit/client';
import { browser } from '@kestack/auth-toolkit/client/browser';
const whoAmI = Effect.gen(function* () {
  const state = yield* (yield* Accounts).check;
  if (state._tag === 'SignedOut') return yield* (yield* Accounts).signIn();
  const client = yield* RpcClient.make(Api);
  return yield* client.WhoAmI();
}).pipe(
  Effect.scoped,
  Effect.provide(Rpcs.http.client(Api, { url: 'https://api.example.com/rpc' })),
  Effect.provide(browser({ url })),
);
```

- The Auth Worker is `authWorker({ url, secret, google, database: d1(env.DB), cookieDomain: '.example.com', brand })`; every origin under `cookieDomain` is trusted and no other is. Add `dev: true` when it runs locally: its pages then show the Kabuki devtools.
- `browser` sends the cookie (`credentials: 'include'`) and an `expect-user` header naming the Active Account on every guarded call; the transport needs no options.
- When another tab switched Accounts, the backend fails the call `Auth.AccountChanged` before the handler runs, and `Accounts` checks again by itself.
- A Batched RPC Request is verified once, and the cookies the Auth Worker refreshed go on its response.
- `signIn()` leaves the page for the Login Screen and never completes in place.

### A CLI signing in as a Device

`device` keeps each Account's Sign-in token in a StdTable the program
chooses; here SQLite, so the Accounts last between runs. Lifted from
`src/client/device/tests/device.test.ts`.

```ts
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
  const client = yield* RpcClient.make(Api);
  return yield* client.WhoAmI();
}).pipe(
  Effect.scoped,
  Effect.provide(Rpcs.http.client(Api, { url: 'https://api.example.com/rpc' })),
);

await Effect.runPromise(SQLite.setup(deviceAccountsTable, { database }));
await Effect.runPromise(
  Effect.andThen(login, whoAmI).pipe(Effect.provide(accounts)),
);
```

- `signIn` prints a link to `/device?code=…&account=…` and its code, and opens the browser when `o` is pressed (`open: 'auto'` opens it at once; without a terminal it only prints). It completes once the User approves.
- Every guarded call carries the Active Account's token as a bearer. The same backend accepts it with no change: it is a Sign-in, not an Access Token ([ADR 0010](./docs/adr/0010-device-login-is-a-first-party-session.md)).
- The Device sends `acme-cli/1.4.0 (<hostname>)` as its User-Agent, so the Home Page lists it as "acme-cli on <hostname>".
- Start-up asks nobody: the stored Accounts are trusted until `check` or a refused call.

### An MCP server with OAuth

An MCP server is one HttpApi endpoint behind `server/http`'s `auth` with
`oauth`; its tools check Scopes inside. The Auth Worker lists the resource
under `oauth.resources`. Lifted from `src/server/http/tests/http.test.ts`;
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
import { Auth } from '@kestack/auth-toolkit';
import { auth } from '@kestack/auth-toolkit/server/http';

const resource = 'https://mcp.example.com/mcp';
const Mcp = HttpApiEndpoint.post('mcp', '/mcp', {
  success: Schema.String,
  error: Auth.Forbidden,
}).pipe(Auth.required);
class Api extends HttpApi.make('mcp-api').add(
  HttpApiGroup.make('mcp').add(Mcp),
) {}
const Handlers = HttpApiBuilder.group(Api, 'mcp', (handlers) =>
  handlers.handle('mcp', () =>
    Effect.gen(function* () {
      yield* Auth.scope('notes:read');
      return (yield* Auth.User).user.email;
    }),
  ),
);
export const App = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(Handlers),
  Layer.provide(
    auth({
      url: 'https://auth.example.com',
      oauth: { resource, scopes: ['notes:read'] },
    }),
  ),
);
```

- `auth` with `oauth` serves the Protected Resource Metadata at both RFC 9728 paths, readable from any origin, naming the Auth Worker as the issuer.
- A call without a token gets a 401 with the `WWW-Authenticate` challenge MCP clients follow; a missing Scope gets a 403 with `insufficient_scope`.
- Access Tokens are checked against the Auth Worker's keys, asking it nothing per call ([ADR 0007](./docs/adr/0007-access-tokens-are-verified-locally-against-jwks.md)). A token minted for another resource is refused.
- MCP clients register themselves; there is nothing to set up per client ([ADR 0009](./docs/adr/0009-mcp-clients-register-themselves.md)).
