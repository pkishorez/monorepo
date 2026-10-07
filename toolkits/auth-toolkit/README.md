# @kstackz/auth-toolkit

One shared sign-in service on Cloudflare, the guard both sides of an Effect API agree on, and the server and client halves that sign in to it

## Big picture

**Run the sign-in service.** One Cloudflare Worker, the Auth Worker, owns
sign-in, sign-out and every Sign-in over a Primary Database (D1). It serves
its own login, consent, device and home pages, so there is nothing else to
deploy. Every other program asks it "who is this?" instead of touching auth
state. A First-Party program (your web app, your CLI, your phone app) holds a
Sign-in; a Third-Party program (an MCP client) holds an Access Token and
needs the opt-in Authorization Server Role. The `worker` doors are this half.

**Sign in to it.** Three doors, one per side. `guard` is the contract both
sides import: `Authz`, built on rpc-toolkit's `Rpc.middleware` (and
`AuthzHttp` on `HttpApi.middleware`). `server` is its half on a Backend:
`authz.layer` checks every guarded call with a Resolver Service whose
`device` version reads a Name Token and whose `cloud` version asks the Auth
Worker. `client` is the app's half on the device Backend: `SignIn`, the
Service every Sign-in mechanism provides, and `signIn.named`, which signs in
by name with a Name Token. Running sign-in on a device (the Gate, each
Account's Session, `createApp`) is
[`@kstackz/platform-toolkit`](../platform-toolkit)'s
([ADR 0006](../../docs/adr/0006-platforms-may-break-toolkits-keep-what-persists.md)).

`server/cloud`, `client/web`, `client/expo` and `client/cli` are doors of
their own because they bring better-auth's server code, better-auth's
browser client, Expo modules and Node, and
Metro bundles every import it sees: a device Backend on a phone must never
load the cloud Resolver. Why the toolkits are cut this way is
[ADR 0005](../../docs/adr/0005-three-toolkits-three-doors.md); the words are
in [`CONTEXT.md`](./CONTEXT.md) and the package's decisions in
[`docs/adr/`](./docs/adr/). Every `createAuthWorker` option is in
[`docs/auth-worker-configuration.md`](./docs/auth-worker-configuration.md),
the schema runbook in [`docs/migrations.md`](./docs/migrations.md). Run
`pnpm --filter @kstackz/auth-toolkit stories` for the executable RPC
walkthrough.

## Install

```sh
pnpm add @kstackz/auth-toolkit
```

Peer dependencies, all optional; install the ones your doors need:

- `effect`: `guard`, `server`, `client` and `client/cli` are Effect Layers and Services.
- `@kstackz/rpc-toolkit`: the guard is its Middleware.
- `@kstackz/std-toolkit`: `signIn.named` keeps Named Accounts in its Table adapters.
- `react`: the Auth Worker's own pages are React.
- `better-sqlite3`: `@kstackz/auth-toolkit/worker/memory` runs SQLite in-process for tests.
- `alchemy`: `@kstackz/auth-toolkit/worker/alchemy` declares the D1 resource in `alchemy.run.ts`.
- `expo-auth-session`: `@kstackz/auth-toolkit/client/expo` runs the authorization in the system sign-in sheet, with PKCE and a checked `state`.
- `expo-secure-store`: `@kstackz/auth-toolkit/client/expo` keeps each User's tokens in the keychain (Keystore on Android).
- `expo-web-browser`: `manageAccounts` from `@kstackz/auth-toolkit/client/expo` opens the Auth Worker's Home Page in the sign-in sheet.

## Exports

### `@kstackz/auth-toolkit/worker`

| Export                   | What it does                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `createAuthWorker`       | Assembles the Auth Worker and returns the better-auth instance plus a fetch handler that serves the API and pages. |
| `d1`                     | Builds the Primary Database Provider from a Cloudflare D1 binding.                                                 |
| `isTrustedOrigin`        | Tells whether an origin matches any of the given trusted origin patterns.                                          |
| `validateTrustedOrigins` | Throws when a trusted origin pattern is neither a full origin, a host pattern, nor an app scheme and path.         |
| `AUTH_PAGES`             | The paths of the login, consent, device, and error pages.                                                          |

### `@kstackz/auth-toolkit/worker/memory`

| Export   | What it does                                                                                 |
| -------- | -------------------------------------------------------------------------------------------- |
| `memory` | Builds an in-memory SQLite Primary Database Provider migrated with the shipped `.sql` files. |

### `@kstackz/auth-toolkit/worker/alchemy`

| Export                      | What it does                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `d1PrimaryDatabaseResource` | Declares the D1 database as an Alchemy resource with the package's migrations attached. |

### `@kstackz/auth-toolkit/guard`

| Export                  | What it does                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `Authz.guard`           | Attaches the guard to an Rpc or RpcGroup, with an optional policy; the nearest one wins.             |
| `Authz.bearer`          | Client half: signs every guarded call with a token, read at each call or waited for.                 |
| `Authz.policy`          | Builds a policy from an invariant and the reason it fails Forbidden with.                            |
| `Authz.scope`           | Builds a policy that holds only for an Access Token carrying every listed Scope.                     |
| `Authz.Current`         | The Service a guarded handler reads who called from.                                                 |
| `Authz.Resolver`        | The Service that finds out who a request is from; tests replace it.                                  |
| `Authz.Unauthenticated` | Error for a guarded call nobody signed (401).                                                        |
| `Authz.Forbidden`       | Error for a call whose policy refused (403).                                                         |
| `Authz.Unavailable`     | Error when the Auth Worker could not be asked (503).                                                 |
| `AuthzHttp`             | The same guard for Effect HttpApi: `guard`, `policy`, `scope`, `Current`, `Resolver` and the errors. |

### `@kstackz/auth-toolkit/server`

| Export          | What it does                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `authz.layer`   | Server half of `Authz`: resolves each guarded RPC's caller, checks its policy, provides it.            |
| `authz.http`    | Server half of `AuthzHttp` for Effect HttpApi.                                                         |
| `authz.device`  | The device Resolver: reads the caller from a Name Token, asking no one.                                |
| `authz.cookies` | Verifies once per batched request and relays refreshed cookies; give it as `Rpc.http.server`'s `wrap`. |

### `@kstackz/auth-toolkit/server/cloud`

| Export                    | What it does                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `authz`                   | Everything `server`'s `authz` has, plus `cloud`.                                                                              |
| `authz.cloud`             | The cloud Resolver: asks the Auth Worker about a cookie or bearer, and verifies Access Tokens itself given a `resource`.      |
| `verifyRequest`           | Without Effect: forwards a request's cookie or bearer to the Auth Worker and returns the User, Sign-in and refreshed cookies. |
| `verifyAccessToken`       | Without Effect: verifies a bearer Access Token against the Auth Worker's JWKS for one Resource Server.                        |
| `createMcpResourceServer` | Without Effect: an MCP Server's fetch handler that accepts only Access Tokens and publishes its Protected Resource Metadata.  |

### `@kstackz/auth-toolkit/client`

| Export               | What it does                                                                   |
| -------------------- | ------------------------------------------------------------------------------ |
| `signIn.named`       | Sign-in by name on the device Backend, each Account holding a Name Token.      |
| `SignIn`             | The Service every Sign-in mechanism provides: list, sign in, switch, sign out. |
| `Unreachable`        | Error when the Auth Worker could not be reached or refused.                    |
| `nameToken`          | Makes and reads a Name Token.                                                  |
| `namedUser`          | The Named Account an email names.                                              |
| `namedChooser`       | A `choose` for `signIn.named` that a dialog answers.                           |
| `namedAccountsTable` | The StdTable Named Accounts are kept in.                                       |

The Gate, `createApp`, `memoryHost` (formerly `memoryPlatform`), `Backend`,
`backendNamed` and `keepSyncs` are in
[`@kstackz/platform-toolkit`](../platform-toolkit).

### `@kstackz/auth-toolkit/client/web`

| Export   | What it does                                                              |
| -------- | ------------------------------------------------------------------------- |
| `cookie` | Sign-in in a browser against the Auth Worker, with its cookie and Google. |

### `@kstackz/auth-toolkit/client/expo`

| Export           | What it does                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `oauth`          | Sign-in on a phone as the app's First-Party OAuth client, each User's tokens in secure storage. |
| `manageAccounts` | Opens the Auth Worker's Home Page in the system sign-in sheet.                                  |

### `@kstackz/auth-toolkit/client/cli`

| Export                      | What it does                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| `deviceCode`                | Sign-in for a CLI by Device Login, the token kept between runs.          |
| `DeviceCode`                | The Service `deviceCode` provides: `login`, `logout`, `token`, `whoami`. |
| `DeviceCode.rpcSession`     | Signs every RPC call with the kept token.                                |
| `SignedOut`                 | Error when there is no Sign-in, or a dead one.                           |
| `DeviceLoginFailed`         | Error when the code was denied or expired.                               |
| `AuthWorkerUnreachable`     | Error when the Auth Worker could not be reached at all.                  |
| `AuthWorkerUnavailable`     | Error when the Auth Worker answered with a 5xx status.                   |
| `AuthWorkerRejected`        | Error when the Auth Worker answered with a 4xx status.                   |
| `InvalidAuthWorkerResponse` | Error when the Auth Worker's response did not have the expected shape.   |

## Usage

### Run the sign-in service

Your Worker entrypoint calls `createAuthWorker` once and hands every request
to its `handler`; `alchemy.run.ts` declares the D1 database with the
package's migrations. The same call runs in tests with `memory()`, as
`src/worker/worker/tests/device-login.test.ts` does.

```ts
// src/worker.ts
import { createAuthWorker, d1 } from '@kstackz/auth-toolkit/worker';

export default {
  fetch(request: Request, env: Env) {
    const { handler } = createAuthWorker({
      baseURL: 'https://auth.example.com',
      secret: env.AUTH_SECRET,
      branding: { appName: 'Example' },
      database: d1(env.DB),
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      trustedOrigins: ['https://app.example.com', '*.preview.example.com'],
      cookieDomain: '.example.com',
    });
    return handler(request);
  },
};

// alchemy.run.ts
import * as Cloudflare from 'alchemy/Cloudflare';
import { d1PrimaryDatabaseResource } from '@kstackz/auth-toolkit/worker/alchemy';

const db = d1PrimaryDatabaseResource('auth-db');
export const authWorker = await Cloudflare.Worker('auth-worker', {
  entrypoint: 'src/worker.ts',
  bindings: { DB: db },
});
```

- `handler` serves `/api/auth/*`, the pages at `/`, `/login`, `/consent`, `/device` and `/error`, and their embedded assets.
- `trustedOrigins` allows the browser's Direct Sign-in Check and drives credentialed CORS; `cookieDomain` lets every subdomain read the cookie.
- `validateUser` is the User Admission Policy; `multiSession: { maximumAccounts }` caps the Accounts a browser holds (default 5).
- Add `authorizationServer` only when a Third-Party program or a phone app needs Access Tokens; `firstPartyClients` lists phone apps ([ADR 0017](./docs/adr/0017-first-party-native-apps-are-fixed-oauth-clients.md)).
- `d1PrimaryDatabaseResource` applies pending migrations on every `alchemy deploy`.

### Sign in to it

The contract guards its calls; the cloud Backend serves them over HTTP with
the cloud Resolver; a Sign-in is a Layer of `SignIn`. Lifted from
`stories/effect-rpc` and `src/client/sign-in/named/tests/named.test.ts`.

```ts
// api.ts, shared by both sides
const WhoAmI = Rpc.make('WhoAmI', { success: Schema.String }).pipe(
  Authz.guard(),
);
export const Api = RpcGroup.make(WhoAmI);
export const Handlers = Api.toLayer({
  WhoAmI: () => Effect.map(Authz.Current, ({ user }) => user.email),
});

// worker.ts, the cloud Backend
import { authz } from '@kstackz/auth-toolkit/server/cloud';
const rpc = Rpc.http.server(
  Api,
  Handlers.pipe(
    Layer.merge(authz.layer),
    Layer.provide(authz.cloud({ authWorkerUrl: 'https://auth.example.com' })),
  ),
  { wrap: authz.cookies },
);

// The device Backend: the same handlers, on the device Resolver.
const device = Handlers.pipe(
  Layer.merge(authz.layer),
  Layer.provide(authz.device),
);

// The client: a Sign-in per Backend, each a Layer of SignIn.
import { SignIn, signIn } from '@kstackz/auth-toolkit/client';
import { cookie } from '@kstackz/auth-toolkit/client/web';
const cloudSignIn = cookie({ authWorkerUrl: 'https://auth.example.com' });
const deviceSignIn = signIn.named({
  choose: Effect.succeed({ email: 'ada@demo' }),
});
const accounts = await Effect.runPromise(
  Effect.gen(function* () {
    const accounts = yield* SignIn;
    yield* accounts.signIn();
    return yield* accounts.list; // each with its user, token and active
  }).pipe(Effect.provide(deviceSignIn)),
);
```

- `Authz.guard()` alone requires a caller; `Authz.guard(Authz.policy(invariant, reason))` also authorizes. The nearest declaration wins between an RPC and its group.
- No caller fails `Authz.Unauthenticated`, a refused policy `Authz.Forbidden`, an unreachable Auth Worker `Authz.Unavailable`. Tests replace only `Authz.Resolver`.
- `authz.cloud` gets `resource` to accept Access Tokens too, which makes the Backend a Resource Server (phone apps and MCP clients call it so).
- A Named Account's token is a Name Token, which `authz.device` reads and no one verifies. Named Accounts are kept in `namedAccountsTable`, in memory unless `storage` is given.
- On a phone, the cloud Sign-in is `oauth({ authWorkerUrl, clientId, redirectUri, resource })` from `@kstackz/auth-toolkit/client/expo`.
- An app does not run these itself: the Web and Expo Platforms give them to [`@kstackz/platform-toolkit`](../platform-toolkit)'s Gate, which signs every API call with the active Account's token.

A CLI signs in with `deviceCode({ authWorkerUrl, app, version })` from
`@kstackz/auth-toolkit/client/cli`: `login` prints a code and URL, opens
the browser, waits for approval, and keeps the token at
`$XDG_STATE_HOME/<app>/auth.json` (mode `0600`); `DeviceCode.rpcSession`
signs every RPC call with it, and any Backend accepts it as a Sign-in
([ADR 0010](./docs/adr/0010-device-login-is-a-first-party-session.md)).

An MCP Server is `createMcpResourceServer({ authWorkerUrl, resource,
requiredScopes, handler })` from `@kstackz/auth-toolkit/server/cloud`: it
accepts only Access Tokens for its `resource`, publishes its Protected
Resource Metadata so MCP clients find the Auth Worker, and hands `handler`
the Token Principal. The Auth Worker needs `authorizationServer` with the
resource listed ([ADR 0009](./docs/adr/0009-mcp-clients-register-themselves.md)).
