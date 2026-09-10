# Server: protect RPCs

Attaches the Auth Cannotation to Effect RPCs in an app built by `psf-setup`, and provides its Server Implementation at the HTTP host. Requires an `rpc-worker` instance and the Auth Worker's URL.

## Decide

Walk this for every request:

```text
Is the target RPC group hosted by an rpc-worker (HTTP) instance?
├── No, only by rpc-durable-object
│   └── Stop. Cookies travel on the WebSocket upgrade, not on RPC messages,
│       so Authz.guard has nothing to verify and fails every call as
│       Unauthenticated. Offer: (a) host the group on an HTTP instance, or
│       (b) gate the whole socket at the upgrade (below). Never attach
│       Authz.guard to a group a Durable Object hosts.
└── Yes
    Does src/server/rpc/<name>/entry.ts provide authzLayer?
    ├── No → boundary setup: replace entry.ts with this primitive's, add
    │        src/shared/auth, then continue.
    └── Yes → continue
    Is the condition only "signed in"?
    ├── Yes → Authz.guard()  (an Authentication Requirement)
    └── No  → Authz.policy(invariant, reason) then Authz.guard(policy)
    Does the condition hold for every RPC in the group?
    ├── Yes → guard the group: pipe(Group, Authz.guard(policy))
    └── No  → guard the RPC:  Rpc.make(...).pipe(Authz.guard(policy))
```

Nearest Wins: an RPC's own policy beats its group's; an RPC without one inherits the nearest group policy; `Authz.guard()` with no policy never removes an inherited one. Before adding a guard, read the group's existing guards and state in one sentence which policy each affected RPC ends up with. Two rules that must both hold are combined in one policy with `Effect`, never by stacking two guards.

Sign-in restrictions ("only company accounts may log in") are not endpoint policies. Send those to the auth-worker phase.

## Files

Adds:

- `src/shared/auth/`: `authUrlFor(hostname)`. Local dev hosts get the local Auth Worker; everything else gets production. Shared by server and client.

Replaces:

- `src/server/rpc/__NAME__/entry.ts`: the HTTP host with `authzLayer`, `resolverLive`, and `authzCookies`. `authzCookies` relays refreshed session cookies and verifies once per batched request; it requires `RpcSerialization.layerJson`, which the host already uses.

## Declaring guards

Guards and policies live in the group's definition folder, `src/shared/rpc/<group>/`, because the browser imports it and `auth-toolkit/rpc` is browser-safe. Never import `auth-toolkit/rpc/server` there.

```ts
import { Effect, Schema } from 'effect';
import { pipe } from 'effect/Function';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Authz } from 'auth-toolkit/rpc';

const companyAccount = Authz.policy(
  ({ user }) => user.email.endsWith('@example.com'),
  'An example.com account is required',
);

const Hello = Rpc.make('Hello', { success: Schema.String }).pipe(Authz.guard());
const Export = Rpc.make('Export', { success: Schema.String }).pipe(
  Authz.guard(companyAccount),
);

export const Greeting = pipe(RpcGroup.make(Hello, Export), Authz.guard());
```

Groups use `pipe(group, Authz.guard(...))`: the installed Effect declares `RpcGroup.pipe` but does not ship it at runtime. The reason string is what the client sees in `Authz.Forbidden`; write it for the user.

Handlers read identity from `Authz.CurrentAuth`:

```ts
Hello: () => Effect.map(Authz.CurrentAuth, ({ user }) => greet(user.name)),
```

Failures are `Authz.Unauthenticated` (no valid session), `Authz.Forbidden` (policy rejected), `Authz.VerificationUnavailable` (the Auth Worker could not be reached). Client code handles all three; a guarded call never fails with anything else for auth reasons.

## Gating a Durable Object socket

When the user picks option (b), verify in `src/server.ts` before forwarding the upgrade, using `verifyRequest` from `auth-toolkit/server`:

```ts
case '/ws/__NAME__': {
  const authWorkerUrl = authUrlFor(new URL(request.url).hostname);
  const verified = await verifyRequest({ authWorkerUrl, request });
  if (!verified) return new Response('Unauthorized', { status: 401 });
  return env.__NAME_ENV___RPC.getByName('singleton').fetch(request);
}
```

Say plainly that this checks the session once at connect, not per call, and that a session revoked mid-connection stays connected until the socket closes.

## Tests

Handler tests replace only `Authz.Resolver` and keep the real guards:

```ts
const TestResolver = Layer.succeed(
  Authz.Resolver,
  Authz.Resolver.of({
    resolve: () =>
      Effect.succeed({ currentAuth: { user, session }, refreshedCookies: [] }),
  }),
);
const TestAuthz = authzLayer.pipe(Layer.provide(TestResolver));
```

Every new policy gets one test that passes it and one that fails it with `Authz.Forbidden`.

## Seams

- `package.json`: add `auth-toolkit: workspace:*` to dependencies.
- `laymos.config.json`: add layer `shared-auth` (paths `src/shared/auth`, module `src/shared/auth` exposed) once. Rules: `server-rpc` uses `shared-auth`; `shared-rpc-definitions` needs no rule (it imports only `auth-toolkit/rpc`). When gating a socket, `server-entry` uses `shared-auth`.

## Verify

`pnpm lint` and `pnpm test` pass. From the app folder with `pnpm dev` running, an unauthenticated call to a guarded RPC returns an `Unauthenticated` error body, not a 500:

```sh
curl -s -X POST <local-url>/rpc/__NAME__ -H 'content-type: application/json' \
  -d '[{"_tag":"Request","id":"1","tag":"Hello","payload":null,"headers":[]}]'
```

Report which RPCs changed and the policy each now carries.
