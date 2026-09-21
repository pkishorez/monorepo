# auth-toolkit

Curated better-auth building blocks: one shared Auth Worker (Cloudflare D1), a client subpath for React session hooks, a cli subpath for Device Login, and a server subpath for backend-to-backend verification

## Big picture

One Cloudflare Worker, the Auth Worker, owns sign-in, sign-out, and session
validation over a Primary Database. Every other program asks it "who is
this?" instead of touching auth state. Which door a program uses follows one
split: a First-Party program (your web app, your CLI) holds a Session and is
served by the always-on Identity Role; a Third-Party program (an MCP client)
holds an Access Token and needs the opt-in Authorization Server Role. Web,
CLI, and MCP are three stories on that one split, not three systems.

The package builds on `rpc-toolkit` for the `Authz` Cannotation that guards
Effect RPC and HTTP API endpoints, and on `kui-toolkit` for the prebuilt
login, consent, device, and home pages the Worker serves itself. Effect is
optional: `auth-toolkit/server` and `auth-toolkit/server/mcp` are plain
TypeScript.

Vocabulary lives in [`CONTEXT.md`](./CONTEXT.md). Decisions live in
[`docs/adr/`](./docs/adr/). Every `createAuthWorker` option, and the
behaviour every deployment inherits (rate limiting off, Cookie Cache
revocation lag, admin plugin, bearer handling, cookie relay), is in
[`docs/auth-worker-configuration.md`](./docs/auth-worker-configuration.md).
The schema and migration runbook is
[`docs/migrations.md`](./docs/migrations.md). The Effect integrations have
their own deep dives in
[`src/server/effect/rpc/README.md`](./src/server/effect/rpc/README.md) and
[`src/server/effect/http-api/README.md`](./src/server/effect/http-api/README.md).
Run `pnpm --filter auth-toolkit stories` for the executable RPC walkthrough.

## Install

```sh
pnpm add auth-toolkit
```

Peer dependencies, all optional; install the ones your subpaths need:

- `effect`: the `rpc`, `rpc/server`, `http-api`, `http-api/server`, and `cli` subpaths are Effect Layers and Services.
- `react`: `auth-toolkit/client` returns React hooks.
- `better-sqlite3`: `auth-toolkit/database/memory` runs SQLite in-process for tests.
- `alchemy`: `auth-toolkit/alchemy/d1` declares the D1 resource in `alchemy.run.ts`.

## Exports

### `auth-toolkit/worker`

| Export                   | What it does                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `createAuthWorker`       | Assembles the Auth Worker and returns the better-auth instance plus a fetch handler that serves the API and pages. |
| `isTrustedOrigin`        | Tells whether an origin matches any of the given trusted origin patterns.                                          |
| `validateTrustedOrigins` | Throws when a trusted origin pattern is neither a full origin nor a host pattern.                                  |
| `AUTH_PAGES`             | The paths of the login, consent, device, and error pages.                                                          |

### `auth-toolkit/client`

| Export             | What it does                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `createAuthClient` | Builds the browser client for the Auth Worker with `useSession`, `useLoginError`, `signIn.google`, and `signOut`. |

### `auth-toolkit/server`

| Export          | What it does                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `verifyRequest` | Forwards a request's cookie or bearer header to the Auth Worker and returns the User, Session, and refreshed cookies, or null. |

### `auth-toolkit/server/access-token`

| Export              | What it does                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `verifyAccessToken` | Verifies a bearer Access Token for one resource against the Auth Worker's JWKS and returns its identity, or null. |

### `auth-toolkit/server/mcp`

| Export                    | What it does                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `createMcpResourceServer` | Wraps a request handler so it accepts only Access Tokens, passes a Token Principal, and serves Protected Resource Metadata. |

### `auth-toolkit/rpc`

| Export                          | What it does                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Authz`                         | The Auth Cannotation for Effect RPC; safe to import from contracts shared with the browser.     |
| `Authz.guard`                   | Attaches an Authentication Requirement, or an Authorization Policy, to an RPC or an RPC group.  |
| `Authz.policy`                  | Builds an Authorization Policy from a boolean or Effect invariant and the reason it fails with. |
| `Authz.scope`                   | Builds a policy that passes only a Token Principal carrying every listed Scope.                 |
| `Authz.CurrentAuth`             | Service holding the verified Principal while a guarded handler runs.                            |
| `Authz.Resolver`                | Service tag of the Current Auth Resolver; tests replace it, production uses `resolverLive`.     |
| `Authz.Unauthenticated`         | Error for a request with no valid credential.                                                   |
| `Authz.Forbidden`               | Error for a Principal a policy rejected.                                                        |
| `Authz.VerificationUnavailable` | Error when the Auth Worker could not complete Server-Side Verification.                         |

### `auth-toolkit/rpc/server`

| Export         | What it does                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| `authzLayer`   | Server Implementation of the RPC Auth Cannotation; requires `Authz.Resolver`.                           |
| `resolverLive` | Production Current Auth Resolver; verifies Sessions, and Access Tokens too when given a `resource`.     |
| `authzCookies` | Wraps an RPC HTTP app to verify once per batched request and relay refreshed cookies onto the response. |

### `auth-toolkit/http-api`

| Export                          | What it does                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Authz`                         | The Auth Cannotation for Effect HTTP API; safe to import from contracts shared with the browser. |
| `Authz.guard`                   | Attaches an Authentication Requirement, or an Authorization Policy, to an endpoint or a group.   |
| `Authz.policy`                  | Builds an Authorization Policy from a boolean or Effect invariant and the reason it fails with.  |
| `Authz.scope`                   | Builds a policy that passes only a Token Principal carrying every listed Scope.                  |
| `Authz.CurrentAuth`             | Service holding the verified Principal while a guarded handler runs.                             |
| `Authz.Resolver`                | Service tag of the Current Auth Resolver; tests replace it, production uses `resolverLive`.      |
| `Authz.Unauthenticated`         | Error for a request with no valid credential; HTTP 401.                                          |
| `Authz.Forbidden`               | Error for a Principal a policy rejected; HTTP 403.                                               |
| `Authz.VerificationUnavailable` | Error when the Auth Worker could not complete Server-Side Verification; HTTP 503.                |

### `auth-toolkit/http-api/server`

| Export         | What it does                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `authzLayer`   | Server Implementation of the HTTP API Auth Cannotation; requires `Authz.Resolver` and relays refreshed cookies. |
| `resolverLive` | Production Current Auth Resolver; the same value `auth-toolkit/rpc/server` exports.                             |

### `auth-toolkit/cli`

| Export                      | What it does                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `CliAuth`                   | Service with `login`, `logout`, `whoami`, and `token` for a First-Party CLI.                                            |
| `CliAuth.layer`             | Builds `CliAuth` from the Auth Worker URL and the CLI's name and version; needs `HttpClient`, `FileSystem`, and `Path`. |
| `CliAuth.rpcSession`        | Layer that puts the stored Session on every RPC client call as a bearer.                                                |
| `SignedOut`                 | Error when there is no stored Session or the Auth Worker no longer knows it.                                            |
| `DeviceLoginFailed`         | Error when the User denied the code or it expired before approval.                                                      |
| `AuthWorkerUnreachable`     | Error when the Auth Worker could not be reached at all.                                                                 |
| `AuthWorkerUnavailable`     | Error when the Auth Worker answered with a 5xx status.                                                                  |
| `AuthWorkerRejected`        | Error when the Auth Worker answered with a 4xx status.                                                                  |
| `InvalidAuthWorkerResponse` | Error when the Auth Worker's response did not have the expected shape.                                                  |

### `auth-toolkit/database/d1`

| Export              | What it does                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `d1PrimaryDatabase` | Builds the Primary Database Provider from a Cloudflare D1 binding. |

### `auth-toolkit/database/memory`

| Export                  | What it does                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `memoryPrimaryDatabase` | Builds an in-memory SQLite Primary Database Provider migrated with the shipped `.sql` files. |

### `auth-toolkit/alchemy/d1`

| Export                      | What it does                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `d1PrimaryDatabaseResource` | Declares the D1 database as an Alchemy resource with the package's migrations attached. |

## Usage

### Stand up the Auth Worker

Your Worker entrypoint calls `createAuthWorker` once and hands every request
to its `handler`. The same call runs in tests with the in-memory Provider, as
`src/worker/tests/device-login.test.ts` does.

```ts
// src/worker.ts
import { createAuthWorker } from 'auth-toolkit/worker';
import { d1PrimaryDatabase } from 'auth-toolkit/database/d1';

interface Env {
  DB: D1Database;
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

export default {
  fetch(request: Request, env: Env) {
    const { handler } = createAuthWorker({
      baseURL: 'https://auth.example.com',
      secret: env.AUTH_SECRET,
      branding: { appName: 'Example' },
      database: d1PrimaryDatabase(env.DB),
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      trustedOrigins: ['https://app.example.com', '*.preview.example.com'],
      cookieDomain: '.example.com',
      validateUser: ({ user }) => {
        if (!user.email?.endsWith('@example.com')) {
          return {
            error: 'email_not_allowed',
            errorDescription: 'Use your example.com Google account',
          };
        }
      },
    });
    return handler(request);
  },
};
```

```ts
// alchemy.run.ts
import * as Cloudflare from 'alchemy/Cloudflare';
import { d1PrimaryDatabaseResource } from 'auth-toolkit/alchemy/d1';

const db = d1PrimaryDatabaseResource('auth-db');

export const authWorker = await Cloudflare.Worker('auth-worker', {
  entrypoint: 'src/worker.ts',
  bindings: { DB: db },
});
```

- `handler` serves `/api/auth/*`, the pages at `/`, `/login`, `/device`, and `/error`, and their embedded assets. Nothing else to deploy.
- `trustedOrigins` allows the browser client's Direct Session Check and drives credentialed CORS. `cookieDomain` lets every subdomain read the cookie.
- `validateUser` is the User Admission Policy. Return nothing to admit; return an error to reject.
- Swap `database` for `memoryPrimaryDatabase()` in tests. The same migrations run.
- `d1PrimaryDatabaseResource` applies pending migrations on every `alchemy deploy`.
- Add `authorizationServer` only when a Third-Party program needs Access Tokens. See [`docs/auth-worker-configuration.md`](./docs/auth-worker-configuration.md).
- Add `multiSession: { enabled: true }` to let a browser hold several Signed-in Accounts and switch between them from every page. See [ADR 0012](./docs/adr/0012-account-switch-is-browser-wide.md).

### Guard an Effect RPC on a Consumer Backend

The contract attaches `Authz.guard()`; the handler reads `Authz.CurrentAuth`;
the server provides `authzLayer` with `resolverLive`. Lifted from
`stories/effect-rpc/01-protecting-your-first-rpc` and
`apps/alchemy-console/src/server/host/rpc-host`.

```ts
// contract.ts, shared with the browser
import { Effect, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Authz } from 'auth-toolkit/rpc';

const GetProfile = Rpc.make('GetProfile', {
  payload: {},
  success: Schema.Struct({ userId: Schema.String }),
}).pipe(Authz.guard());

export const Api = RpcGroup.make(GetProfile);

// handlers.ts
export const Handlers = Api.toLayer({
  GetProfile: () =>
    Effect.map(Authz.CurrentAuth, ({ user }) => ({ userId: user.id })),
});

// server.ts
import { Layer } from 'effect';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import {
  authzCookies,
  authzLayer,
  resolverLive,
} from 'auth-toolkit/rpc/server';

const dependencies = Layer.mergeAll(
  Handlers,
  authzLayer.pipe(
    Layer.provide(resolverLive({ authWorkerUrl: 'https://auth.example.com' })),
  ),
  RpcSerialization.layerJson,
);

const app = Effect.gen(function* () {
  const rpc = yield* RpcServer.toHttpEffect(Api);
  return yield* authzCookies(rpc);
}).pipe(Effect.provide(dependencies));
```

- `Authz.guard()` alone requires a valid Session. `Authz.guard(Authz.policy(invariant, reason))` also authorizes. Nearest declaration wins between an RPC and its group.
- `resolverLive` forwards the request's cookie or bearer to the Auth Worker. Give it `resource: 'https://api.example.com'` to also accept Access Tokens locally and make this backend a Resource Server.
- A CLI's Device Login token is a Session sent as a bearer. It is accepted without `resource`.
- No credential fails with `Authz.Unauthenticated`; a rejected policy with `Authz.Forbidden`; an unreachable Auth Worker with `Authz.VerificationUnavailable`.
- `authzCookies` verifies once per batched request and relays refreshed cookies. It needs the non-framing JSON serializer.
- Tests replace only `Authz.Resolver` with `Layer.succeed(Authz.Resolver, Authz.Resolver.of({ resolve }))`; the Cannotation and policies still run.
- Without Effect, call `verifyRequest` from `auth-toolkit/server` and append each `refreshedCookies` entry as its own `Set-Cookie` header.

### Sign a CLI in with Device Login

`CliAuth` is the CLI's browser: it keeps the Session, attaches it to every
call, and drops it on sign-out. Lifted from `src/cli/tests/cli.test.ts`.

```ts
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { CliAuth } from 'auth-toolkit/cli';
import { Console, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

const login = Effect.gen(function* () {
  const auth = yield* CliAuth;
  const user = yield* auth.login;
  yield* Console.log(`Signed in as ${user.email}`);
});

login.pipe(
  Effect.provide(
    CliAuth.layer({
      authWorkerUrl: 'https://auth.example.com',
      app: 'example',
      version: '1.0.0',
    }),
  ),
  Effect.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)),
  NodeRuntime.runMain,
);
```

```ts
// Put the Session on every RPC call.
Layer.mergeAll(
  Layer.effect(NotesRpc, RpcClient.make(Notes)).pipe(Layer.provide(transport)),
  CliAuth.rpcSession,
);
```

- `login` prints the code and device URL, opens the browser when run in a terminal, polls until the User approves, and stores the Session at `$XDG_STATE_HOME/<app>/auth.json` (default `~/.local/state`) with mode `0600`.
- `whoami` asks the Auth Worker who the Session belongs to. `token` reads it. `logout` ends the Session at the Auth Worker and deletes the file.
- Every request names the CLI as `<app>/<version>`, which is how it appears on the Home Page.
- No Session or a dead one fails with `SignedOut`. A denied or expired code fails `login` with `DeviceLoginFailed`. Auth Worker problems fail with `AuthWorkerUnreachable`, `AuthWorkerUnavailable`, `AuthWorkerRejected`, or `InvalidAuthWorkerResponse`, each with a printable `message`.
- Nothing to refresh: the token never changes and the Auth Worker slides its expiry on use. Consumer Backends need no opt-in; see [ADR 0010](./docs/adr/0010-device-login-is-a-first-party-session.md).
