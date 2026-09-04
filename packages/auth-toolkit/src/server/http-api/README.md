# auth-toolkit/server/http-api

Protects Effect HTTP API endpoints with the same Server-Side Verification
`auth-toolkit/server` uses for plain requests. `withAuthz()` requires valid
Current Auth; passing a policy additionally authorizes the verified User and
Session.

```ts
import { Effect, Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';
import {
  CurrentAuth,
  Forbidden,
  withAuthz,
  type AuthPolicy,
} from 'auth-toolkit/server/http-api';

const administratorOnly: AuthPolicy = ({ user }) =>
  user.role === 'admin'
    ? Effect.void
    : Effect.fail(new Forbidden({ reason: 'Administrator required' }));

const Me = HttpApiEndpoint.get('me', '/me', {
  success: Schema.String,
}).pipe(withAuthz());

const DeleteUser = HttpApiEndpoint.delete('deleteUser', '/users/:id', {
  params: { id: Schema.String },
}).pipe(withAuthz(administratorOnly));

const PrivateApi = HttpApiGroup.make('private').add(Me, DeleteUser);
```

Handlers read the verified User and Session from `CurrentAuth`:

```ts
import { HttpApi, HttpApiBuilder } from 'effect/unstable/httpapi';

class Api extends HttpApi.make('api').add(PrivateApi) {}

const Handlers = HttpApiBuilder.group(Api, 'private', (handlers) =>
  handlers
    .handle('me', () => Effect.map(CurrentAuth, ({ user }) => user.email))
    .handle('deleteUser', ({ params }) => Effect.log(`Deleting ${params.id}`)),
);
```

Provide the middleware alongside the HTTP API handlers:

```ts
import { Layer } from 'effect';
import { httpApiAuthLayer } from 'auth-toolkit/server/http-api';

export const ApiLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(Handlers),
  Layer.provide(
    httpApiAuthLayer({ authWorkerUrl: 'https://auth.example.com' }),
  ),
);
```

Apply a default policy after adding the group's endpoints. An endpoint policy
takes precedence over the group policy:

```ts
const PrivateApi = HttpApiGroup.make('private')
  .add(Me, DeleteUser)
  .pipe(withAuthz(memberOnly));
```

Effect group middleware applies only to endpoints already present when the
middleware is added. Calling `withAuthz()` without a policy never removes an
endpoint policy.

For tests, replace only Current Auth resolution. The HTTP API middleware and
policies still run normally:

```ts
import { Effect, Layer } from 'effect';
import {
  CurrentAuthResolver,
  httpApiAuthMiddlewareLayer,
} from 'auth-toolkit/server/http-api';

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

const TestHttpAuth = httpApiAuthMiddlewareLayer.pipe(
  Layer.provide(TestCurrentAuth),
);
```

Missing or invalid sessions return `Unauthenticated` with HTTP status 401.
Rejected policies return `Forbidden` with status 403. If the Auth Worker cannot
complete Server-Side Verification, `AuthVerificationUnavailable` returns status 503.

Refreshed cookies are appended automatically before the response is sent. This
works with ordinary and streaming responses and preserves multiple cookies with
the same name and different paths.

## Files

| File               | Role                                                             |
| ------------------ | ---------------------------------------------------------------- |
| `http-api.ts`      | Public middleware, layers, decorator, and shared auth vocabulary |
| `middleware.ts`    | Request verification, policies, and refreshed-cookie relay       |
| `http-api.test.ts` | Type-safe handlers, failures, policy inheritance, and cookies    |
