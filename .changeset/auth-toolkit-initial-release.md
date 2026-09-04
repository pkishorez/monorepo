---
'auth-toolkit': patch
---

Initial release of `auth-toolkit`: curated `better-auth` building blocks for a single shared Auth Worker (Cloudflare D1 + KV), with a `client` subpath for React session hooks, a `server` subpath for backend-to-backend session verification, and a `server/rpc` subpath for protecting Effect RPCs. Includes D1 and in-memory primary database Providers, Cloudflare KV and in-memory session store Providers, and Alchemy resources for provisioning the D1 database and KV namespace.

- `client`: React session hooks, plus optional Dash integration, user admission validation, Google redirect handling, and structured login errors.
- `server`: backend-to-backend session verification via `CurrentAuth`.
- `server/rpc`: `withAuthz()` to protect Effect RPCs and RPC groups with the same Server-Side Verification as plain requests, `CurrentAuth` to read the verified user and session in handlers, `rpcAuthLayer`/`rpcAuthMiddlewareLayer` to provide the middleware, and `withAuthCookies` to relay cookies refreshed during verification back to the HTTP response. Policies declared on an RPC take precedence over a group policy; RPCs without their own policy inherit the nearest group policy.
