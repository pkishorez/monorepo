# Application setup

## Prepare

Inspect the app’s client, server entry, RPC transport, and installed toolkit APIs.

Resolve the existing production auth URL and the app’s local and deployed origins.

Follow [web architecture](../../software-factory/applications/web/architecture.md) for placement and install `auth-toolkit` with the required peers.

## Connect the client

Create the auth client in `src/client/auth/auth.ts` using the auth worker’s URL, and export it through `index.ts`:

```ts
import { createAuthClient } from 'auth-toolkit/client';

export const authClient = createAuthClient({
  baseURL: 'https://auth.example.com',
});
```

Keep login and logout UI under routes, using `useSession()` for session state.

Call `signIn.google()` and `signOut()` from login and logout controls.

Show `useLoginError()` beside the login control and handle loading and signed-out states.

Return to the current page by default, configuring success and error destinations when the requested flow needs them.

Use the existing root provider when authentication needs shared lifetime management.

## Connect the server

Provide `authzLayer` and `resolverLive({ authWorkerUrl })` alongside RPC handlers, reusing existing wiring:

```ts
import { Layer } from 'effect';
import { authzLayer, resolverLive } from 'auth-toolkit/rpc/server';

const AuthenticatedRpcLive = RpcLive.pipe(
  Layer.provide(authzLayer),
  Layer.provide(resolverLive({ authWorkerUrl: 'https://auth.example.com' })),
);
```

Verify sessions through the shared auth worker, keeping its D1 and KV providers there.

For request/response HTTP RPC, wrap the HTTP app with `authzCookies` and use supported non-framing JSON serialization to relay refreshed cookies.

For streaming or WebSockets, use the transport’s supported authentication path and explain cookie refresh limitations.

Keep the existing RPC client and verify that request cookies reach backend authentication.

Check trusted origins, credentialed requests, and cookie scope together; allowing an origin alone does not deliver cookies.

For local development, verify a hostname and HTTPS setup compatible with production auth cookies; plain localhost may not share them.

Follow [infrastructure](../infrastructure/guide.md) for auth worker changes deployed through CI.

Follow [usage](../usage/guide.md) to add endpoint guards.

## Verify

Check affected types, Laymos rules, login, session loading, logout, and login errors.

Exercise an authenticated request through the actual transport and check refreshed cookies where supported.

Check local access and the deployed origin when available.

Report checks waiting on CI, credentials, or interactive sign-in.
