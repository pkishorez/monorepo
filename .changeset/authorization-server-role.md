---
'auth-toolkit': patch
---

Add the Authorization Server Role. `createAuthWorker` takes an optional `authorizationServer` block that runs Better Auth's OAuth provider, device authorization grant, and JWT signing keys so MCP clients and CLIs can obtain Access Tokens bound to a Resource Server. The schema now always contains the OAuth, JWKS, and device code tables. `resolverLive` accepts an optional `resource` to also verify Access Tokens locally against the Auth Worker's JWKS; `Authz.CurrentAuth` becomes a Principal (`kind: 'session' | 'token'`) and `Authz.scope` guards by Scope. New door: `server/access-token`. With the role on, `createAuthWorker(...).handler` also serves the login, consent, and device pages: a TanStack Start app on kui-toolkit, prebuilt inside this package with its assets embedded, so a consumer's Worker needs no build and no assets binding.

Breaking: `CurrentAuth` values now carry `kind`; test resolvers must return `{ kind: 'session', user, session }`. The auth-worker primitive gains the Authorization Server config in `infra/config.ts`. `createAuthWorker` now requires `branding: { appName, logoUrl? }`; `appName` moves there from `authorizationServer`, and the logo doubles as the favicon.
