# rpc-toolkit

Opinionated abstractions over Effect RPC and Effect HttpApi. See `CONTEXT.md` for the vocabulary and `docs/adr/` for the decisions.

## Install

Install `rpc-toolkit` with its declared Effect peer version. Alchemy is an
optional peer, required only for the `rpc/cloudflare/alchemy/*` entry points.
Browser and shared-contract entry points do not import Cloudflare or Alchemy.

## RPC integrations

| Entry point                                             | Capability                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `rpc-toolkit/rpc/invocation`                            | Server-controlled `InvocationKind`: `fresh` or `replay`      |
| `rpc-toolkit/rpc/websocket-client`                      | WebSocket transport, connection status, subscription restart |
| `rpc-toolkit/rpc/cloudflare/hibernating-rpc`            | Durable Object socket callbacks and stream checkpoints       |
| `rpc-toolkit/rpc/cloudflare/alchemy/rpc-worker`         | Alchemy's Effect RPC Worker                                  |
| `rpc-toolkit/rpc/cloudflare/alchemy/durable-rpc-worker` | Worker and Durable Object deployment composition             |

See the [complete client/server example](docs/websocket-example.md).
Hibernation replays the original request through server middleware. Authorization
implementations must check current permission; connection identity alone is not
current authorization. Admission middleware can read `InvocationKind` to avoid
charging again on replay. Subscription restart after reconnect is a fresh call,
and client middleware runs again. Continuous revocation during an uninterrupted
stream remains application policy.

## Cannotation

A cascading annotation: a declaration on an endpoint or group about how it may be called. A more specific endpoint's value replaces the group's; an unset endpoint inherits it; values never merge. The declaration lives in shared contract code, the implementations do not.

```ts
// contract.ts — shared by client and server
import { Cannotation } from 'rpc-toolkit/rpc/cannotation';

type Role = 'admin' | 'user';
const Role = Cannotation.make<Role>()('app/Role', {
  provides: CurrentUser,
  error: Forbidden,
  client: true,
});

const Ban = Rpc.make('Ban').pipe(Role.with('admin'));
const Users = Role.with('user')(RpcGroup.make(WhoAmI, Ban));

// server.ts
const RoleLive = Role.layer(({ value, headers }) => verify(headers, value));

// client.ts
const RoleClient = Role.clientLayer(({ request, next }) =>
  next(withCookie(request)),
);
```

`rpc-toolkit/http/cannotation` has the same shape over `HttpApiEndpoint` / `HttpApiGroup`, plus `security` for OpenAPI.

Attach a `requires` cannotation before the one that `provides` what it needs — the later attachment wraps the earlier one.
