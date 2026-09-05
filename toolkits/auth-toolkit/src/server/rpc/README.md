# auth-toolkit/rpc and auth-toolkit/rpc/server

Protects Effect RPCs with the same Server-Side Verification `auth-toolkit/server`
does for plain requests. `Authz` is the Auth Cannotation for the RPC Sibling, built
with `rpc-toolkit/rpc/cannotation`: its Declaration lives in `auth-toolkit/rpc` and
is safe to import from contract code shared with the browser; its Server
Implementation lives in `auth-toolkit/rpc/server`.

`Authz.guard()` requires a valid session; `Authz.guard(policy)` additionally
authorizes the current user and session. `Authz.policy(invariant, reason)` builds a policy
from a boolean (or `Effect<boolean>`) invariant over Current Auth and the reason
a `Authz.Forbidden` carries when it fails; `Authz.guard` also accepts a
hand-written Effect rule for anything the invariant form cannot express.

```ts
// contract.ts — shared by client and server
import { Effect, Schema } from 'effect';
import { pipe } from 'effect/Function';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Authz } from 'auth-toolkit/rpc';

const hasAcmeEmail = Authz.policy(
  ({ user }) => user.email.endsWith('@acme.com'),
  'Acme account required',
);

const Me = Rpc.make('Me', {
  success: Schema.String,
}).pipe(Authz.guard());

const DeleteUser = Rpc.make('DeleteUser', {
  payload: { id: Schema.String },
  success: Schema.Void,
}).pipe(Authz.guard(hasAcmeEmail));

const PrivateApi = pipe(RpcGroup.make(Me, DeleteUser), Authz.guard());
```

Effect `4.0.0-rc.110` declares `RpcGroup.pipe` in its types but does not provide
it at runtime, so groups must use `pipe(group, Authz.guard(...))` or
`Authz.guard(...)(group)`. RPC values support their normal `.pipe(...)` method.

Nearest Wins: a policy declared directly on an RPC takes precedence over a group
policy, an RPC without its own policy inherits the nearest group policy, and
`Authz.guard()` without a policy never removes inherited authorization. Compose
more complex policies using ordinary Effect operators.

Handlers read the verified user and session from `Authz.CurrentAuth`:

```ts
import { Authz } from 'auth-toolkit/rpc';

const Handlers = PrivateApi.toLayer({
  Me: () => Effect.map(Authz.CurrentAuth, ({ user }) => user.email),
  DeleteUser: ({ id }) => Effect.log(`Deleting ${id}`),
});
```

Provide the Server Implementation and the production resolver alongside the RPC
handlers. One `resolverLive` can serve both Siblings:

```ts
// server.ts
import { Layer } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import { authzLayer, resolverLive } from 'auth-toolkit/rpc/server';

const RpcLive = RpcServer.layer(PrivateApi).pipe(
  Layer.provide(Handlers),
  Layer.provide(authzLayer),
  Layer.provide(resolverLive({ authWorkerUrl: 'https://auth.example.com' })),
);
```

For tests, replace only `Authz.Resolver`. The Cannotation and policies
still run normally:

```ts
import { Effect, Layer } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import { authzLayer } from 'auth-toolkit/rpc/server';

const TestResolver = Layer.succeed(
  Authz.Resolver,
  Authz.Resolver.of({
    resolve: () =>
      Effect.succeed({
        currentAuth: { user, session },
        refreshedCookies: [],
      }),
  }),
);

const TestAuthz = authzLayer.pipe(Layer.provide(TestResolver));
```

The Server Implementation records `auth.verify_session` and
`auth.evaluate_policy` spans. Its logs report verification outcomes and safe
cookie-change counts without including cookie, User, or Session values.

Missing or invalid sessions fail with `Authz.Unauthenticated`; rejected policies with
`Authz.Forbidden`; and an Auth Worker that cannot complete Server-Side Verification
with `Authz.VerificationUnavailable`.

For request/response HTTP, wrap the app to relay cookies refreshed during
verification:

```ts
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import {
  authzCookies,
  authzLayer,
  resolverLive,
} from 'auth-toolkit/rpc/server';

const makeApp = Effect.gen(function* () {
  const rpcApp = yield* RpcServer.toHttpEffect(PrivateApi);
  return authzCookies(rpcApp);
}).pipe(
  Effect.provide(Handlers),
  Effect.provide(authzLayer),
  Effect.provide(resolverLive({ authWorkerUrl: 'https://auth.example.com' })),
  Effect.provide(RpcSerialization.layerJson),
);
```

`authzCookies` also verifies only once when an HTTP request batches multiple
protected RPC calls. Cookie relay requires the non-framing JSON serializer:
framed streaming responses commit their headers before RPC execution finishes,
and WebSockets have no HTTP response on which to set a cookie. Authentication
still works without the wrapper, but refreshed cookies are not relayed.

## Files

| File                           | Role                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `src/server/current-auth/`     | The identity, errors, and `policy()` every `Authz` carries                                   |
| `src/server/rpc/authz.ts`      | The curated `Authz` the contract subpath exports; `cannotation.ts` holds the raw Cannotation |
| `src/server/rpc/middleware.ts` | The Server Implementation: verification, policy evaluation, and `authzLayer`                 |
| `src/server/rpc/cookies.ts`    | Per-HTTP-request verification caching and `authzCookies`                                     |
| `src/server/rpc/rpc.ts`        | Composes the above into the module's public surface                                          |
