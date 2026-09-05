# Application setup

Connect an application to the existing production auth instance. Inspect its client, server entry, RPC transport, and installed toolkit APIs. Resolve the auth URL and the application's deployed and local origins before wiring them.

Use [the architecture conventions](../../software-factory/architecture.md) for placement. Install `auth-toolkit` and the peers required by the client and server integrations being used.

## Client

Create the auth capability under `src/client/auth`, following the application's module conventions. Use `createAuthClient` from `auth-toolkit/client` with the auth worker's own URL. Expose session access, Google sign-in, sign-out, and login errors through the toolkit's `useSession`, `signIn.google`, `signOut`, and `useLoginError` APIs.

For example, `src/client/auth/auth.ts` creates the client, exported through the module's `index.ts`:

```ts
import { createAuthClient } from 'auth-toolkit/client';

export const authClient = createAuthClient({
  baseURL: 'https://auth.example.com',
});
```

Keep login and logout UI under routes. Handle session loading, signed-out state, and sign-in failures. Use the current page as the default return destination; configure explicit success and error destinations when the requested flow needs them. Fit authentication into the existing root provider when shared lifetime management is needed.

Within a route component, `authClient.useSession()` supplies session state. A login button calls `authClient.signIn.google()`; a logout button calls `authClient.signOut()`. Display redirect failures from `authClient.useLoginError()` beside the login control.

## Server

Provide `authzLayer` and `resolverLive({ authWorkerUrl })` from `auth-toolkit/rpc/server` alongside the RPC handlers at the server composition boundary. Reuse existing wiring. Consumer backends verify sessions through the shared auth worker; D1 and KV providers belong to that worker.

For example, supply authentication to an existing RPC server layer alongside its handlers:

```ts
import { Layer } from 'effect';
import { authzLayer, resolverLive } from 'auth-toolkit/rpc/server';

const AuthenticatedRpcLive = RpcLive.pipe(
  Layer.provide(authzLayer),
  Layer.provide(resolverLive({ authWorkerUrl: 'https://auth.example.com' })),
);
```

For request/response HTTP RPC, wrap the HTTP app with `authzCookies` and use the supported non-framing JSON serialization to relay refreshed cookies. Inspect the existing transport first. Streaming and WebSocket transports need their supported authentication path and an explicit account of cookie refresh limitations.

Authentication runs on the backend. Keep the existing RPC client composition; verify that the request's cookies actually reach the backend. Check trusted origins, credentialed requests, and cookie scope together. An allowed origin alone does not establish cookie delivery. For local development, verify a compatible local hostname and HTTPS arrangement using the same production auth instance; do not assume plain localhost shares its cookies.

Auth worker configuration changes follow [Infrastructure](../infrastructure/guide.md) and deploy through CI. Add endpoint guards through [Usage](../usage/guide.md).

## Check the connection

Check affected types and Laymos rules. Verify login, session loading, logout, and login error handling. Exercise an authenticated request through the application's actual transport and check refreshed-cookie delivery where supported. Cover the local configuration as well as the deployed origin when available. Report any checks waiting on CI, credentials, or an interactive provider sign-in.
