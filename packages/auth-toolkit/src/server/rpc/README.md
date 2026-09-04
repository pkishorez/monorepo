# auth-toolkit/server/rpc

Protects Effect RPCs with the same Server-Side Verification `auth-toolkit/server`
does for plain requests. `withAuthz()` requires a valid session; passing a
policy additionally authorizes the current user and session.

```ts
import { Effect, Schema } from 'effect';
import { pipe } from 'effect/Function';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Forbidden, withAuthz, type AuthPolicy } from 'auth-toolkit/server/rpc';

const hasAcmeEmail: AuthPolicy = ({ user }) =>
  user.email.endsWith('@acme.com')
    ? Effect.void
    : Effect.fail(new Forbidden({ reason: 'Acme account required' }));

const Me = Rpc.make('Me', {
  success: Schema.String,
}).pipe(withAuthz());

const DeleteUser = Rpc.make('DeleteUser', {
  payload: { id: Schema.String },
  success: Schema.Void,
}).pipe(withAuthz(hasAcmeEmail));

const PrivateApi = pipe(RpcGroup.make(Me, DeleteUser), withAuthz());
```

Effect `4.0.0-rc.110` declares `RpcGroup.pipe` in its types but does not provide
it at runtime, so groups must use `pipe(group, withAuthz(...))` or
`withAuthz(...)(group)`. RPC values support their normal `.pipe(...)` method.

A policy declared directly on an RPC takes precedence over a group policy. An
RPC without its own policy inherits the nearest group policy. Calling
`withAuthz()` without a policy never removes inherited authorization. Compose
more complex policies using ordinary Effect operators.

Handlers read the verified user and session from `CurrentAuth`:

```ts
import { CurrentAuth } from 'auth-toolkit/server/rpc';

const Handlers = PrivateApi.toLayer({
  Me: () => Effect.map(CurrentAuth, ({ user }) => user.email),
  DeleteUser: ({ id }) => Effect.log(`Deleting ${id}`),
});
```

Provide the middleware alongside the RPC handlers:

```ts
import { Layer } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';
import { rpcAuthLayer } from 'auth-toolkit/server/rpc';

const RpcLive = RpcServer.layer(PrivateApi).pipe(
  Layer.provide(Handlers),
  Layer.provide(rpcAuthLayer({ authWorkerUrl: 'https://auth.example.com' })),
);
```

For tests, replace only Current Auth resolution. The RPC middleware and policies
still run normally:

```ts
import { Effect, Layer } from 'effect';
import { CurrentAuthResolver } from 'auth-toolkit/server/rpc';
import { rpcAuthMiddlewareLayer } from 'auth-toolkit/server/rpc';

const TestCurrentAuth = Layer.succeed(
  CurrentAuthResolver,
  CurrentAuthResolver.of({
    resolve: () =>
      Effect.succeed({
        currentAuth: { user, session },
        refreshedCookies: [],
      }),
  }),
);

const TestRpcAuth = rpcAuthMiddlewareLayer.pipe(Layer.provide(TestCurrentAuth));
```

The middleware records `auth.verify_session` and `auth.evaluate_policy` spans.
Its logs report verification outcomes and safe cookie-change counts without
including cookie, User, or Session values.

Authentication failures cross the RPC boundary as `Unauthenticated`;
authorization failures use `Forbidden`.

For request/response HTTP, wrap the app to relay cookies refreshed during
verification:

```ts
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { withAuthCookies } from 'auth-toolkit/server/rpc';

const makeApp = Effect.gen(function* () {
  const rpcApp = yield* RpcServer.toHttpEffect(PrivateApi);
  return withAuthCookies(rpcApp);
}).pipe(
  Effect.provide(Handlers),
  Effect.provide(rpcAuthLayer({ authWorkerUrl: 'https://auth.example.com' })),
  Effect.provide(RpcSerialization.layerJson),
);
```

`withAuthCookies` also verifies only once when an HTTP request batches multiple
protected RPC calls. Cookie relay requires the non-framing JSON serializer:
framed streaming responses commit their headers before RPC execution finishes,
and WebSockets have no HTTP response on which to set a cookie. Authentication
still works without the wrapper, but refreshed cookies are not relayed.

## Files

| File            | Role                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `context.ts`    | Identity (`CurrentAuth`), errors (`Unauthenticated`, `Forbidden`), and the `AuthPolicy` / `AuthorizationPolicy` vocabulary |
| `middleware.ts` | Session verification, `RpcAuthMiddleware`, `rpcAuthLayer`, and the `withAuthz` decorator                                   |
| `cookies.ts`    | Per-HTTP-request verification caching and `withAuthCookies`                                                                |
| `rpc.ts`        | Composes the above into the module's public surface                                                                        |
