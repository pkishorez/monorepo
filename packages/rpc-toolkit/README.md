# rpc-toolkit

Opinionated abstractions over Effect RPC and Effect HttpApi. See `CONTEXT.md` for the vocabulary and `docs/adr/` for the decisions.

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
