# auth-toolkit

Curated `better-auth` building blocks for one shared Auth Worker, plus a
client subpath for React session hooks and a server subpath for
backend-to-backend verification. See `CONTEXT.md` for the vocabulary used
below (Auth Worker, Provider, Consumer Backend, etc).

## The shape of it

One Cloudflare Worker (the **Auth Worker**) owns sign-in, sign-out, and
session validation. It's built by composing two Provider decisions this package
gives you:

```
Primary Database Provider ─┐
                            ├─▶ createAuthWorker(...) ─▶ Auth Worker
Session Store Provider ────┘
```

Everything else talks to that one worker instead of touching auth state
directly:

- Your **frontend** uses `client` to call the Auth Worker straight from the
  browser (sign-in, sign-out, `useSession`).
- Any other **backend** ("Consumer Backend") uses `server` to forward an
  incoming request's cookies to the Auth Worker and find out who's making
  the request.

Only the Auth Worker's entrypoint imports concrete Providers.

## Usage

### 1. Pick your Providers and stand up the Auth Worker

In your own Worker's entrypoint (this file lives in your app, not in this
package):

```ts
// src/worker.ts
import { createAuthWorker } from 'auth-toolkit/worker';
import { d1PrimaryDatabase } from 'auth-toolkit/database/d1';
import { kvSessionStore } from 'auth-toolkit/secondary/cf-kv';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
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
      database: d1PrimaryDatabase(env.DB),
      secondaryStorage: kvSessionStore(env.KV),
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

`database` and `secondaryStorage` are the two Provider decisions — D1 and
Cloudflare KV in production, or the in-memory Providers for tests. Better Auth
rate limiting is disabled for now. `createAuthWorker` does not know which
concrete Providers you picked.

The Auth Worker always includes Better Auth's Admin plugin so the hosted
dashboard can persist and enforce bans. It does not expose the Admin client API
or bootstrap local Administrators. Supplying `dashApiKey` additionally connects
the worker to Better Auth Infrastructure; omitting it leaves Dash disabled.

`validateUser` is an optional User Admission Policy. It runs when an identity
registers, links an account, or starts a fresh provider sign-in. Return nothing
to admit the identity, or return a safe `error` and `errorDescription` to reject
it. Unexpected thrown errors fail closed with a generic message.

### 2. Deploy the D1 database and KV namespace with alchemy

The D1/KV resource helpers build the actual Cloudflare bindings and wire up
migrations, so your `alchemy.run.ts` stays declarative:

```ts
// alchemy.run.ts
import * as Cloudflare from 'alchemy/Cloudflare';
import { d1PrimaryDatabaseResource } from 'auth-toolkit/alchemy/d1';
import { kvSessionStoreResource } from 'auth-toolkit/alchemy/cf-kv';

const db = d1PrimaryDatabaseResource('auth-db');
const kv = kvSessionStoreResource('auth-sessions');

export const authWorker = await Cloudflare.Worker('auth-worker', {
  entrypoint: 'src/worker.ts',
  bindings: { DB: db, KV: kv },
});
```

`d1PrimaryDatabaseResource` defaults `migrationsDir` to the `.sql` files
this package ships — alchemy applies whatever's pending on every
`alchemy deploy`. There's no separate migrate step to remember.

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
[`server/rpc`](./src/server/rpc/README.md).

### 4. Sign in / check session from the frontend

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

### Testing

Swap in the in-memory Providers wherever you'd pass the D1/KV ones — same
`createAuthWorker` call, no other code changes:

```ts
import { createAuthWorker } from 'auth-toolkit/worker';
import { memoryPrimaryDatabase } from 'auth-toolkit/database/memory';
import { memorySessionStore } from 'auth-toolkit/secondary/memory';

const { handler } = createAuthWorker({
  baseURL: 'http://localhost:8787',
  secret: 'test-secret',
  database: memoryPrimaryDatabase(),
  secondaryStorage: memorySessionStore(),
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

| Subpath            | What it gives you                                                                   |
| ------------------ | ----------------------------------------------------------------------------------- |
| `worker`           | `createAuthWorker(config)` — assembles the Auth Worker                              |
| `server`           | `verifyRequest(...)` — Server-Side Verification for a Consumer Backend              |
| `server/rpc`       | `withAuthz(...)` — see [`server/rpc`](./src/server/rpc/README.md)                   |
| `client`           | `createAuthClient(config)` — session, Google sign-in, redirect errors, and sign-out |
| `database/d1`      | Production Primary Database Provider using a D1 binding                             |
| `database/memory`  | In-memory Primary Database Provider, for tests                                      |
| `secondary/cf-kv`  | Production Session Store Provider using Cloudflare KV                               |
| `secondary/memory` | In-memory Session Store Provider, for tests                                         |
| `alchemy/d1`       | Alchemy resource for provisioning D1 and applying migrations                        |
| `alchemy/cf-kv`    | Alchemy resource for provisioning Cloudflare KV                                     |

## Migrations

The package owns one fixed schema and its migrations. After changing the
Auth Worker's model, run this once and commit the generated schema and migration:

```sh
pnpm db:generate
```

Do not edit `schema.generated.ts` or the generated migration files by hand.
Normal builds never regenerate them. The same committed migrations run in the
in-memory Provider and are applied to D1 automatically during `alchemy deploy`.
