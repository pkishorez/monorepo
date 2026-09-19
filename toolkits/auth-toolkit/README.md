# auth-toolkit

Curated `better-auth` building blocks: one shared Auth Worker, and the few
doors every kind of program needs to be signed in against it. See
`CONTEXT.md` for the vocabulary used below (Auth Worker, Consumer Backend,
Session, Access Token, and so on).

## The one idea

One Cloudflare Worker, the **Auth Worker**, owns sign-in, sign-out, and
session validation over a Primary Database. Everything else asks it "who is
this?" instead of touching auth state.

There are only two kinds of program that ask, and the split between them
decides everything else:

- **First-Party**: a program you own, where the User signs in to your
  product. A web app or your own CLI. The Auth Worker's always-on
  **Identity Role** handles it, the credential is a **Session**, and every
  Consumer Backend sees a **Session Principal**. Nothing to register, nothing
  to consent to.
- **Third-Party**: a program you did not write that wants to act as the User
  against your server, such as an MCP client. That needs the opt-in
  **Authorization Server Role**: the program becomes a Client Application,
  the User consents to Scopes, it receives an **Access Token** for one
  Resource Server, and backends see a **Token Principal**.

Web, CLI, and MCP are not three systems. They are three stories on that one
split.

## Three stories

### A web app

Add the sign-in button from `auth-toolkit/client`. The browser cookie carries
the Session. Guard RPC or HTTP handlers with `Authz.guard()` from
`auth-toolkit/rpc` or `auth-toolkit/http-api` and they see who is logged in.
Steps 1, 3, 4, and 7 below.

### Your own CLI

The CLI runs **Device Login** from `auth-toolkit/cli`: it prints a code and a
URL and opens the browser; the User approves on the Auth Worker's device page;
the CLI receives a Session token and keeps it in its Session Store. Every
later call carries that token as a bearer, and the same `Authz.guard()` sees
the same Session Principal a browser produces. No registration, no Scopes, no
consent, no opt-in on the backend. Step 8 below.

### An MCP Server for Claude or Codex

Turn on the Authorization Server Role, list the MCP Server as a resource, and
wrap it with `createMcpResourceServer` from `auth-toolkit/server/mcp`. The
MCP client discovers the Auth Worker, registers itself, the User consents
once, and the tools receive a Token Principal. You hand the client one URL.
Steps 5 and 6 below. This is the only story that needs the rest of the
Authorization Server vocabulary.

## Usage

### 1. Pick your Primary Database Provider and stand up the Auth Worker

In your own Worker's entrypoint (this file lives in your app, not in this
package):

```ts
// src/worker.ts
import { createAuthWorker } from 'auth-toolkit/worker';
import { d1PrimaryDatabase } from 'auth-toolkit/database/d1';

interface Env {
  DB: D1Database;
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_API_KEY?: string;
}

export default {
  fetch(request: Request, env: Env) {
    const { handler } = createAuthWorker({
      baseURL: 'https://auth.example.com',
      secret: env.AUTH_SECRET,
      branding: { appName: 'Example' }, // what the pages show
      database: d1PrimaryDatabase(env.DB),
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      // Dash is omitted when the key is absent or blank.
      dashApiKey: env.BETTER_AUTH_API_KEY,
      validateUser: ({ user }) => {
        if (!user.email?.endsWith('@example.com')) {
          return {
            error: 'email_not_allowed',
            errorDescription: 'Use your example.com Google account',
          };
        }
      },
      trustedOrigins: ['https://*.example.com'],
      cookieDomain: '.example.com',
    });
    return handler(request);
  },
};
```

`database` selects the Primary Database Provider: D1 in production or the
in-memory provider for tests. Sessions and verification records live in that
database. Better Auth rate limiting is disabled for now.

The Cookie Cache still defaults to five minutes; a cache miss reads the Primary
Database. Secondary storage may be reconsidered after measuring performance.
See [the storage decision](./docs/adr/0005-auth-state-uses-only-the-primary-database.md).

The Auth Worker always includes Better Auth's Admin plugin so the hosted
dashboard can persist and enforce bans. It does not expose the Admin client API
or bootstrap local Administrators. Supplying `dashApiKey` additionally connects
the worker to Better Auth Infrastructure; omitting it leaves Dash disabled.

`validateUser` is an optional User Admission Policy. It runs when an identity
registers, links an account, or starts a fresh provider sign-in. Return nothing
to admit the identity, or return a safe `error` and `errorDescription` to reject
it. Unexpected thrown errors fail closed with a generic message.

### 2. Deploy the D1 database with alchemy

The D1 resource helper builds the Cloudflare binding and wires up
migrations, so your `alchemy.run.ts` stays declarative:

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

`d1PrimaryDatabaseResource` supplies the package's Drizzle v1 migrations to
Alchemy, which applies pending migrations on every `alchemy deploy`.
D1 and in-memory SQLite use the same timestamped migration folders, each
containing `migration.sql`. The build includes these folders and their
snapshots. Consumers need no migration configuration changes.

This baseline targets fresh databases. The toolkit pins Drizzle ORM and Kit
to `1.0.0-rc.4`. `db:generate` uses the configured Better Auth Relations v2
adapter to generate tables and relations, then runs Drizzle Kit. D1 and
memory use this same adapter and generated schema.

### 3. Verify requests from another backend (Consumer Backend)

Any other service that needs to know "is this request logged in, as whom"
forwards the incoming cookies to the Auth Worker instead of touching the
database:

```ts
// some other service, e.g. an API worker
import { verifyRequest } from 'auth-toolkit/server';

export default {
  async fetch(request: Request) {
    const verified = await verifyRequest({
      authWorkerUrl: 'https://auth.example.com',
      request,
    });
    if (!verified) return new Response('Unauthorized', { status: 401 });

    const { user, session } = verified;
    // ... handle the request as `user`
  },
};
```

If the Auth Worker refreshed the session during the check,
`verified.refreshedCookies` carries each new cookie separately. Relaying them
back onto your own response is optional; if you do, append every value as its
own `Set-Cookie` header:

```ts
for (const cookie of verified.refreshedCookies) {
  response.headers.append('Set-Cookie', cookie);
}
```

`auth-toolkit/server` is the vanilla server API. Effect integrations live in
separate subpaths, so vanilla consumers do not need to install Effect. For
protecting Effect RPCs declaratively, see
[`rpc` and `server/rpc`](./src/server/effect/rpc/README.md).

### 4. Protect an Effect HTTP API

Attach `Authz.guard()` from `auth-toolkit/http-api` to Effect HTTP API endpoints
to provide typed Current Auth to their handlers, and provide `authzLayer` and `resolverLive` from
`auth-toolkit/http-api/server` next to them. See
[`http-api` and `server/http-api`](./src/server/effect/http-api/README.md) for setup,
policies, testing, errors, and refreshed-cookie relay.

### 5. Turn on the Authorization Server Role

By default the Auth Worker plays only the Identity Role: browsers sign in and
Consumer Backends verify Sessions. Add `authorizationServer` to let a Client
Application (an MCP client, a CLI) obtain an Access Token for a Resource Server
on a User's behalf:

```ts
const { handler } = createAuthWorker({
  ...identityConfig,
  // Each part is a string, or the value plus inline CSS over the pages' own.
  branding: {
    appName: { name: 'Example', style: { letterSpacing: '-0.02em' } },
    logoUrl: 'https://example.com/logo.svg', // also the favicon
  },
  authorizationServer: {
    resources: ['https://api.example.com'], // each Resource Server's audience
    scopes: [{ name: 'notes:write', description: 'Create and edit notes' }],
  },
});
```

This runs Better Auth's OAuth provider and the JWT plugin for signing keys. Access Tokens are JWTs bound to one resource
and carry the User's `email` and `name`. Dynamic client registration is off.
The same `handler` then also serves `/consent`, next to the `/`, `/login`, and
`/device` pages every deployment has: a TanStack Start app on kui-toolkit that
ships prebuilt inside this package, with its assets embedded, so the Worker
needs no assets binding and no build. The schema always contains the OAuth
tables, so switching the role on needs no migration.

`/` is the Home Page. A signed-in User sees every Session on their account,
each browser and CLI with when it signed in, when it was last active, and
when it expires, and can revoke any of them. With this role on, it also lists
the apps they allowed on `/consent`, and revoking one also revokes its refresh
tokens. Access Tokens already issued are JWTs that Resource Servers verify on
their own, so they last until they expire: one hour, better-auth's default.
A signed-out visitor goes to `/login`, and a signed-in one on `/login` goes
back to where they came from.

### 6. Accept Access Tokens on a Consumer Backend

`resolverLive` verifies Sessions by default. Give it this backend's `resource`
to make it a Resource Server that also accepts Access Tokens:

```ts
resolverLive({
  authWorkerUrl: 'https://auth.example.com',
  resource: 'https://api.example.com',
});
```

A request with an `Authorization` header is treated as an Access Token,
verified locally against the Auth Worker's JWKS (cached keys; issuer, audience,
expiry), and never falls back to the cookie. Without `resource`, such a request
is Unauthenticated. `Authz.CurrentAuth` is then a Principal:
`{ kind: 'session', user, session }` or `{ kind: 'token', user, client, scopes }`.
A CLI's Device Login token is a Session, not an Access Token: it is accepted
without `resource` (see step 8).
Policies that read `user.id`, `user.email`, or `user.name` work for both;
`Authz.scope('notes:write')` requires a Token Principal carrying the Scope.
For a hand-rolled host, `verifyAccessToken` from `auth-toolkit/server/access-token`
does the same check.

### 7. Sign in / check session from the frontend

The browser talks to the Auth Worker directly (not proxied through your
app backend), so point it at the Auth Worker's own URL:

```tsx
// src/auth.ts
import { createAuthClient } from 'auth-toolkit/client';

export const authClient = createAuthClient({
  baseURL: 'https://auth.example.com',
});
```

```tsx
// some React component
import { authClient } from './auth';

function LoginButton() {
  const { data: session, isPending } = authClient.useSession();
  const { error, dismiss } = authClient.useLoginError();

  if (isPending) return null;
  if (session) {
    return <button onClick={authClient.signOut}>Sign out</button>;
  }
  return (
    <>
      {error ? (
        <p>
          {error.description ?? error.code}
          <button onClick={dismiss}>Dismiss</button>
        </p>
      ) : null}
      <button onClick={() => authClient.signIn.google()}>
        Sign in with Google
      </button>
    </>
  );
}
```

Google sign-in returns to the current page after success or failure by default.
Stale `error` and `error_description` parameters are removed before starting a
new attempt. Override either destination when needed:

```ts
authClient.signIn.google({
  callbackURL: '/dashboard',
  errorCallbackURL: '/sign-in',
});
```

After an OAuth failure, `useLoginError()` converts the redirect parameters into
`{ code, description? }`. Its `dismiss()` function removes only those parameters
from the address bar without reloading the page.

This only works if the Auth Worker's `trustedOrigins` includes your app's
origin (step 1). The exported handler uses that list for both Better Auth's
origin validation and credentialed CORS responses.

### 8. Sign a CLI in with Device Login

`auth-toolkit/cli` is Effect-only. `CliAuth` is the CLI's equivalent of the
browser: it keeps the Session, attaches it to every call, and drops it on
sign-out.

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

`login` prints the code and the device page URL, opens the browser when run
in a terminal, polls until the User approves, and stores the Session in
`~/.local/state/<app>/auth.json`. `logout` ends the Session at the Auth Worker and
deletes the file. `whoami` asks the Auth Worker who the Session belongs to.
`token` reads it. Every request names the CLI as `<app>/<version>`, which is
how the Session appears on the Home Page; `version` is optional.

Provide `CliAuth.rpcSession` next to an RPC client, over HTTP or WebSocket,
and every call carries the Session:

```ts
Layer.mergeAll(
  Layer.effect(NotesRpc, RpcClient.make(Notes)).pipe(Layer.provide(transport)),
  CliAuth.rpcSession,
);
```

No Session, or a dead one, fails with `SignedOut`; a denied or expired code
fails `login` with `DeviceLoginFailed`. Auth Worker failures distinguish an
unreachable service, a 5xx response, a rejected request, and an incompatible
response. Each has a `message` fit to print. There is nothing to refresh: the token
never changes, and the Auth Worker slides its expiry whenever it is used.

On the server nothing changes. A Resource Server first verifies a bearer as an
Access Token; if that fails, `resolverLive` forwards the same credential to the
Auth Worker as a Session. A backend without a resource checks only for a
Session. The Auth Worker needs nothing new either: Device Login is part of the
Identity Role, and the `/login` and `/device` pages are served on every
deployment.

### Testing

Swap in the in-memory Primary Database Provider in place of D1 — same
`createAuthWorker` call, no other code changes:

```ts
import { createAuthWorker } from 'auth-toolkit/worker';
import { memoryPrimaryDatabase } from 'auth-toolkit/database/memory';

const { handler } = createAuthWorker({
  baseURL: 'http://localhost:8787',
  secret: 'test-secret',
  branding: { appName: 'Example' },
  database: memoryPrimaryDatabase(),
  google: { clientId: 'test', clientSecret: 'test' },
  trustedOrigins: ['http://localhost:5173'],
});
```

`memoryPrimaryDatabase()` runs the same `.sql` migrations D1 gets, against
a `:memory:` SQLite database — so tests exercise the real schema, just not
the real deployment.

### Executable stories

Run `pnpm --filter auth-toolkit stories` for the short Effect RPC walkthrough:
authentication, authorization policies, group inheritance, batched and
concurrent calls, cookie refresh, and failure cases.

## Subpaths

| Subpath               | What it gives you                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `worker`              | `createAuthWorker(config)` — assembles the Auth Worker                                       |
| `server`              | `verifyRequest(...)` — Server-Side Verification for a Consumer Backend                       |
| `server/access-token` | `verifyAccessToken(...)` — local Access Token verification for a Resource Server             |
| `server/mcp`          | `createMcpResourceServer(...)` — an MCP Server that accepts only Access Tokens               |
| `rpc`                 | `Authz` — the RPC Auth Cannotation, safe for shared contracts                                |
| `http-api`            | `Authz` — the HTTP API Auth Cannotation, safe for shared contracts                           |
| `rpc/server`          | `authzLayer`, `resolverLive(...)` — see [`rpc`](./src/server/effect/rpc/README.md)           |
| `http-api/server`     | `authzLayer`, `resolverLive(...)` — see [`http-api`](./src/server/effect/http-api/README.md) |
| `client`              | `createAuthClient(config)` — session, Google sign-in, redirect errors, and sign-out          |
| `cli`                 | `CliAuth` — Device Login, the Session Store, and the Session on every RPC call (Effect)      |
| `database/d1`         | Production Primary Database Provider using a D1 binding                                      |
| `database/memory`     | In-memory Primary Database Provider, for tests                                               |
| `alchemy/d1`          | Alchemy resource for provisioning D1 and applying migrations                                 |

## Migrations

The package owns one fixed schema and its migrations. After changing the
Auth Worker's model, run this once and commit the generated schema and migration:

```sh
pnpm db:generate
```

Do not edit `schema.generated.ts` or the generated migration files by hand.
Normal builds never regenerate them. The same committed migrations run in the
in-memory Provider and are applied to D1 automatically during `alchemy deploy`.
