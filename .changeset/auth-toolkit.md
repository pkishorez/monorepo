---
'auth-toolkit': patch
---

Add the Authorization Server Role. `createAuthWorker` takes an optional `authorizationServer` block that runs Better Auth's OAuth provider and JWT signing keys, so MCP clients can obtain Access Tokens bound to a Resource Server. The schema now always contains the OAuth, JWKS, and device code tables. `resolverLive` accepts an optional `resource` to also verify Access Tokens locally against the Auth Worker's JWKS; `Authz.CurrentAuth` becomes a Principal (`kind: 'session' | 'token'`) and `Authz.scope` guards by Scope. New door: `server/access-token`.

Add Device Login for First-Party CLIs: a new Effect-only `auth-toolkit/cli` subpath exports `CliAuth`, which runs the browser sign-in, keeps the Session, and attaches it to Effect RPC calls; every Consumer Backend accepts the resulting bearer Session with no opt-in. `CliAuth.layer` takes an optional `version`, and the CLI names itself `<app>/<version>` so its Session is recognisable on the Home Page. When the Auth Worker is down or unreachable, the CLI fails with `AuthWorkerUnreachable` and a plain message instead of a raw HTTP error.

`createAuthWorker(...).handler` serves the Auth Worker's pages: a TanStack Start app built on the kui-toolkit `auth` block, prebuilt inside this package with its assets embedded, so a consumer's Worker needs no build and no assets binding. `/` is the Home Page: a signed-in User sees every Session on their account and every app they allowed, and can revoke any of them; revoking an app also revokes its refresh tokens. `/login` only signs in, and every other page sends a signed-out visitor there and back. The device page is served on every deployment; the consent page comes with the Authorization Server Role. Better Auth errors redirect to a branded Error Screen at `/error`, and unknown paths show a branded Not Found screen.

Fix fresh D1 database deployments with Alchemy 2.0.0-beta.76 by upgrading Drizzle ORM and Kit to v1 RC and shipping one timestamped migration layout shared with in-memory SQLite. Use Better Auth's official Relations v2 adapter and schema generator, preserving the existing database helper APIs.

Breaking:

- `CurrentAuth` values now carry `kind`; test resolvers must return `{ kind: 'session', user, session }`.
- The auth-worker primitive gains the Authorization Server config in `infra/config.ts`.
- `createAuthWorker` now requires `branding: { appName, logoUrl? }`; the logo doubles as the favicon.
- The shipped baseline migration and its hash were replaced. Reconcile an existing `drizzle_migrations` history before deploying this version; fresh databases are unaffected.
