# auth-toolkit

## 0.0.3

### Patch Changes

- [`de0ecfd`](https://github.com/pkishorez/monorepo/commit/de0ecfdabf9863c7020f478c66e12567009c7d65) Thanks [@pkishorez](https://github.com/pkishorez)! - Add the Authorization Server Role. `createAuthWorker` takes an optional `authorizationServer` block that runs Better Auth's OAuth provider, device authorization grant, and JWT signing keys so MCP clients and CLIs can obtain Access Tokens bound to a Resource Server. The schema now always contains the OAuth, JWKS, and device code tables. `resolverLive` accepts an optional `resource` to also verify Access Tokens locally against the Auth Worker's JWKS; `Authz.CurrentAuth` becomes a Principal (`kind: 'session' | 'token'`) and `Authz.scope` guards by Scope. New door: `server/access-token`. With the role on, `createAuthWorker(...).handler` also serves the login, consent, and device pages: a TanStack Start app on kui-toolkit, prebuilt inside this package with its assets embedded, so a consumer's Worker needs no build and no assets binding.

  Breaking: `CurrentAuth` values now carry `kind`; test resolvers must return `{ kind: 'session', user, session }`. The auth-worker primitive gains the Authorization Server config in `infra/config.ts`. `createAuthWorker` now requires `branding: { appName, logoUrl? }`; `appName` moves there from `authorizationServer`, and the logo doubles as the favicon.

- [`8c85c6d`](https://github.com/pkishorez/monorepo/commit/8c85c6d5fba84703e47012faca532bdc3f7a0b39) Thanks [@pkishorez](https://github.com/pkishorez)! - Add Device Login for First-Party CLIs: a new Effect-only `auth-toolkit/cli` subpath exports `CliAuth`, which runs the browser sign-in, keeps the Session, and attaches it to Effect RPC calls; every Consumer Backend accepts the resulting bearer Session with no opt-in. The OAuth device grant is removed; the device page is now a first-party sign-in served on every deployment.

- [`63d69a8`](https://github.com/pkishorez/monorepo/commit/63d69a86a55876525bd04067f7e6414261451443) Thanks [@pkishorez](https://github.com/pkishorez)! - Fix fresh D1 database deployments with Alchemy 2.0.0-beta.76 by upgrading Drizzle ORM and Kit to v1 RC and shipping one timestamped migration layout shared with in-memory SQLite. Use Better Auth's official Relations v2 adapter and schema generator, preserving the existing database helper APIs.

  Breaking for existing databases: the shipped baseline migration and its hash were replaced. Reconcile an existing `drizzle_migrations` history before deploying this version; fresh databases are unaffected.

- [`9458de2`](https://github.com/pkishorez/monorepo/commit/9458de2992fb2c447f2c032e203e1ccfecb2d347) Thanks [@pkishorez](https://github.com/pkishorez)! - The Auth Worker's pages are rebuilt on a new kui-toolkit `auth` block, with one width, one loader, and no layout shifts. `/` is now the Home Page: a signed-in User sees every Session on their account and every app they allowed, and can revoke any of them. Revoking an app also revokes its refresh tokens. `/login` only signs in, and every other page sends a signed-out visitor there and back. `CliAuth.layer` takes an optional `version`, and the CLI names itself `<app>/<version>` so its Session is recognisable on the Home Page. When the Auth Worker is down or unreachable, the CLI now fails with `AuthWorkerUnreachable` and a plain message instead of a raw HTTP error. Better Auth errors now redirect to a branded Error Screen at `/error` instead of Better Auth's default page, and unknown paths show a branded Not Found screen.
- Updated dependencies [[`7134458`](https://github.com/pkishorez/monorepo/commit/7134458c8c2c2cf08ceb66868b1bdf2445e3c179), [`9458de2`](https://github.com/pkishorez/monorepo/commit/9458de2992fb2c447f2c032e203e1ccfecb2d347), [`61be51e`](https://github.com/pkishorez/monorepo/commit/61be51e0282f73c36581caa8470206a868c2572e), [`df778b6`](https://github.com/pkishorez/monorepo/commit/df778b696f82514c9d42393c676dbe6fd8f82163), [`df778b6`](https://github.com/pkishorez/monorepo/commit/df778b696f82514c9d42393c676dbe6fd8f82163), [`9209fed`](https://github.com/pkishorez/monorepo/commit/9209fed3c72faaa0abc14248b342e31d85f90a46), [`dff4ebc`](https://github.com/pkishorez/monorepo/commit/dff4ebcc9c6dfc7da4f14491513150b80a00e107)]:
  - kui-toolkit@0.0.2
  - rpc-toolkit@0.0.2

## 0.0.2

### Patch Changes

- [`45bf2a4`](https://github.com/pkishorez/monorepo/commit/45bf2a4f5b999899be9c6c6dc2da1b42cf534de8) Thanks [@pkishorez](https://github.com/pkishorez)! - Store all persisted auth state in the primary database and remove secondary storage support. This avoids duplicate session writes and Cloudflare KV's consistency and atomic-operation limitations; secondary storage can be reconsidered after measuring performance.

  Remove `secondaryStorage` from `createAuthWorker` calls and remove imports from `auth-toolkit/secondary/cf-kv`, `auth-toolkit/secondary/memory`, and `auth-toolkit/alchemy/cf-kv`; these subpaths and their providers have been removed. Remove the KV binding and resource from consuming deployment definitions. Keep the existing primary database and its migrations: sessions were already persisted there, so no schema migration is required. Cookie caching and the disabled Better Auth rate limiter retain their existing settings.

## 0.0.1

### Patch Changes

- [`0168da6`](https://github.com/pkishorez/monorepo/commit/0168da64c8a93ce3a7ff75f28daaef1d3bb9c944) Thanks [@pkishorez](https://github.com/pkishorez)! - Initial release of `auth-toolkit`: curated `better-auth` building blocks for a single shared Auth Worker, React clients, backend-to-backend session verification, and authorization for Effect RPC and HTTP APIs.

  - `worker`: `createAuthWorker` composes database and session store providers with Google sign-in, user admission validation, trusted origins, credentialed CORS, and shared-domain cookies. Includes Admin plugin ban enforcement and optional Better Auth Dash integration.
  - `client`: `createAuthClient` provides React session hooks, Google sign-in, sign-out, configurable success/error redirects, and structured login errors with dismissal that cleans up redirect parameters.
  - `server`: `verifyRequest` forwards request cookies to the Auth Worker and returns the verified user, session, and refreshed cookies for optional relay. This vanilla server API does not require Effect.
  - `rpc` and `http-api`: shared-contract-safe `Authz.guard()` declarations protect RPCs, endpoints, and groups. `Authz.policy` builds application-owned authorization rules, and `Authz.CurrentAuth` exposes the verified user and session to handlers. More specific policies take precedence over group policies; a guard without a policy does not remove inherited authorization.
  - `rpc/server`: `authzLayer` and `resolverLive` implement session verification and policy enforcement. `authzCookies` relays refreshed cookies and shares verification across protected calls in one HTTP batch; cookie relay requires non-framing JSON responses and is keyed by cookie name, so same-name cookies collapse to the last one.
  - `http-api/server`: `authzLayer` and `resolverLive` enforce the same authorization rules, automatically relay refreshed cookies, and return HTTP 401, 403, or 503 for unauthenticated requests, forbidden access, or unavailable verification. Both Effect integrations expose typed errors and a replaceable `Authz.Resolver` for tests.
  - `database/d1` and `database/memory`: D1 and in-memory SQLite primary database providers using the same bundled schema migrations.
  - `secondary/cf-kv` and `secondary/memory`: Cloudflare KV and in-memory session store providers.
  - `alchemy/d1` and `alchemy/cf-kv`: resource helpers provision D1 and KV, with bundled D1 migrations applied during deployment.

- Updated dependencies [[`5ed984c`](https://github.com/pkishorez/monorepo/commit/5ed984c11698fcb63af2ba858e650e22e5dbba2e)]:
  - rpc-toolkit@0.0.1
