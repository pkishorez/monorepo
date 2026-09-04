# auth-toolkit/http-api and auth-toolkit/http-api/server

Protects Effect HTTP API endpoints with the same Server-Side Verification
`auth-toolkit/server` uses for plain requests. `Authz` is the Auth Cannotation for
the HTTP Sibling, built with `rpc-toolkit/http/cannotation`: its Declaration lives
in `auth-toolkit/http-api` and is safe to import from contract code shared with
the browser; its Server Implementation lives in `auth-toolkit/http-api/server`.

`Authz.guard()` requires valid Current Auth; `Authz.guard(policy)` additionally
authorizes the verified User and Session. `Authz.policy(invariant, reason)` builds a policy
from a boolean (or `Effect<boolean>`) invariant over Current Auth and the reason
a `Authz.Forbidden` carries when it fails; `Authz.guard` also accepts a
hand-written Effect rule for anything the invariant form cannot express.

```ts
// contract.ts — shared by client and server
import { Effect, Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';
import { Authz } from 'auth-toolkit/http-api';

const administratorOnly = Authz.policy(
  ({ user }) => user.role === 'admin',
  'Administrator required',
);

const Me = HttpApiEndpoint.get('me', '/me', {
  success: Schema.String,
}).pipe(Authz.guard());

const DeleteUser = HttpApiEndpoint.delete('deleteUser', '/users/:id', {
  params: { id: Schema.String },
}).pipe(Authz.guard(administratorOnly));

const PrivateApi = HttpApiGroup.make('private').add(Me, DeleteUser);
```

Handlers read the verified User and Session from `Authz.CurrentAuth`:

```ts
import { HttpApi, HttpApiBuilder } from 'effect/unstable/httpapi';
import { Authz } from 'auth-toolkit/http-api';

class Api extends HttpApi.make('api').add(PrivateApi) {}

const Handlers = HttpApiBuilder.group(Api, 'private', (handlers) =>
  handlers
    .handle('me', () => Effect.map(Authz.CurrentAuth, ({ user }) => user.email))
    .handle('deleteUser', ({ params }) => Effect.log(`Deleting ${params.id}`)),
);
```

Provide the Server Implementation and the production resolver alongside the HTTP
API handlers. One `resolverLive` can serve both Siblings:

```ts
// server.ts
import { Layer } from 'effect';
import { authzLayer, resolverLive } from 'auth-toolkit/http-api/server';

export const ApiLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(Handlers),
  Layer.provide(authzLayer),
  Layer.provide(resolverLive({ authWorkerUrl: 'https://auth.example.com' })),
);
```

Apply a default policy after adding the group's endpoints. Nearest Wins: an
endpoint policy takes precedence over the group policy, and `Authz.guard()`
without a policy never removes an endpoint policy.

```ts
const PrivateApi = HttpApiGroup.make('private')
  .add(Me, DeleteUser)
  .pipe(Authz.guard(memberOnly));
```

Effect group middleware applies only to endpoints already present when the
Cannotation is attached.

For tests, replace only `Authz.Resolver`. The Cannotation and policies
still run normally:

```ts
import { Effect, Layer } from 'effect';
import { Authz } from 'auth-toolkit/http-api';
import { authzLayer } from 'auth-toolkit/http-api/server';

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

Missing or invalid sessions return `Authz.Unauthenticated` with HTTP status 401.
Rejected policies return `Authz.Forbidden` with status 403. If the Auth Worker cannot
complete Server-Side Verification, `Authz.VerificationUnavailable` returns status 503.

Refreshed cookies are appended automatically before the response is sent. This
works with ordinary and streaming responses and preserves multiple cookies with
the same name and different paths.

## Files

| File                                   | Role                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/server/current-auth/`             | The identity, errors, and `policy()` every `Authz` carries                                   |
| `src/server/http-api/authz.ts`         | The curated `Authz` the contract subpath exports; `cannotation.ts` holds the raw Cannotation |
| `src/server/http-api/middleware.ts`    | The Server Implementation: verification, policies, and refreshed-cookie relay                |
| `src/server/http-api/http-api.ts`      | `authzLayer` and the module's public surface                                                 |
| `src/server/http-api/http-api.test.ts` | Type-safe handlers, failures, policy inheritance, and cookies                                |
