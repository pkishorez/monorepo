---
'auth-toolkit': patch
---

Initial release of `auth-toolkit`: curated `better-auth` building blocks for a single shared Auth Worker, React clients, backend-to-backend session verification, and authorization for Effect RPC and HTTP APIs.

- `worker`: `createAuthWorker` composes database and session store providers with Google sign-in, user admission validation, trusted origins, credentialed CORS, and shared-domain cookies. Includes Admin plugin ban enforcement and optional Better Auth Dash integration.
- `client`: `createAuthClient` provides React session hooks, Google sign-in, sign-out, configurable success/error redirects, and structured login errors with dismissal that cleans up redirect parameters.
- `server`: `verifyRequest` forwards request cookies to the Auth Worker and returns the verified user, session, and refreshed cookies for optional relay. This vanilla server API does not require Effect.
- `rpc` and `http-api`: shared-contract-safe `Authz.guard()` declarations protect RPCs, endpoints, and groups. `Authz.policy` builds application-owned authorization rules, and `Authz.CurrentAuth` exposes the verified user and session to handlers. More specific policies take precedence over group policies; a guard without a policy does not remove inherited authorization.
- `rpc/server`: `authzLayer` and `resolverLive` implement session verification and policy enforcement. `authzCookies` relays refreshed cookies and shares verification across protected calls in one HTTP batch; cookie relay requires non-framing JSON responses.
- `http-api/server`: `authzLayer` and `resolverLive` enforce the same authorization rules, automatically relay refreshed cookies, and return HTTP 401, 403, or 503 for unauthenticated requests, forbidden access, or unavailable verification. Both Effect integrations expose typed errors and a replaceable `Authz.Resolver` for tests.
- `database/d1` and `database/memory`: D1 and in-memory SQLite primary database providers using the same bundled schema migrations.
- `secondary/cf-kv` and `secondary/memory`: Cloudflare KV and in-memory session store providers.
- `alchemy/d1` and `alchemy/cf-kv`: resource helpers provision D1 and KV, with bundled D1 migrations applied during deployment.
