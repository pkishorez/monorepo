# Auth Worker configuration

What each `createAuthWorker` option does, and the behaviour a deployment
inherits whether or not it sets anything. Vocabulary follows
[`CONTEXT.md`](../CONTEXT.md).

## Options

| Option                | Effect                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseURL`             | The Auth Worker's own public URL. Consumer Backends and the browser client point at this value.                                                                                                                            |
| `secret`              | The better-auth secret. Rotating it signs every User out.                                                                                                                                                                  |
| `branding`            | What the pages show. `appName` and `logoUrl` are strings, or the value plus inline CSS over the pages' own. `logoUrl` is also the favicon.                                                                                 |
| `database`            | The Primary Database Provider: `d1PrimaryDatabase(env.DB)` in production, `memoryPrimaryDatabase()` in tests. Sessions and verification records live here.                                                                 |
| `google`              | Google OAuth client id and secret. Google is the only identity provider.                                                                                                                                                   |
| `trustedOrigins`      | Origins allowed to make a Direct Session Check. Each entry is a full origin (`https://app.example.com`) or a host pattern (`*.example.com`). Malformed patterns throw at startup. Scheme-less patterns match `https` only. |
| `cookieDomain`        | The Shared Cookie Domain, for example `.example.com`, so every subdomain's browser can read the session cookie. Omit it for a single-origin deployment.                                                                    |
| `cookieCacheMaxAge`   | Cookie Cache lifetime in seconds. Defaults to 300. See "Revocation lag" below.                                                                                                                                             |
| `dashApiKey`          | Connects the Worker to Better Auth Infrastructure (Dash). Absent or blank leaves Dash disabled.                                                                                                                            |
| `validateUser`        | The User Admission Policy. See below.                                                                                                                                                                                      |
| `authorizationServer` | Turns on the Authorization Server Role. See below.                                                                                                                                                                         |
| `multiSession`        | Lets a browser hold several Signed-in Accounts. Off unless `enabled` is true. See below.                                                                                                                                   |

## Always on

- **Admin plugin.** The Worker always includes better-auth's Admin plugin so the hosted dashboard can persist and enforce bans. It does not expose the Admin client API and does not bootstrap local Administrators.
- **Rate limiting is disabled.** better-auth's built-in rate limiter is off. Put rate limiting in front of the Worker if you need it.
- **Device Login.** The `deviceAuthorization` and `bearer` plugins run on every deployment, so a CLI can sign in without the Authorization Server Role. A Device Login token is a Session sent as a bearer, not an Access Token.
- **Pages.** The handler serves `/`, `/login`, `/device`, and `/error` from a prebuilt TanStack Start app with embedded assets. No assets binding and no build step in the consumer. With the Authorization Server Role on it also serves `/consent` and `/.well-known/*`.
- **CORS.** `trustedOrigins` drives both better-auth's origin validation and the credentialed CORS headers the handler adds on `/api/auth/*`. Preflights from untrusted origins get 403.

## User Admission Policy

`validateUser` runs when an identity registers, links an account, or starts a
fresh provider sign-in. Return nothing to admit. Return
`{ error, errorDescription }` with safe, user-facing text to reject. A thrown
error fails closed with a generic message. The policy does not re-evaluate
existing Sessions; ban an already-admitted User instead.

## Revocation lag

The Cookie Cache lets the Auth Worker confirm a Session from the cookie alone
for up to `cookieCacheMaxAge` seconds. A revoked Session can therefore keep
working on another device until its cache expires. A cache miss reads the
Primary Database. There is no secondary storage; see
[ADR 0005](./adr/0005-auth-state-uses-only-the-primary-database.md).

## Authorization Server Role

```ts
authorizationServer: {
  resources: ['https://api.example.com'],
  scopes: [{ name: 'notes:write', description: 'Create and edit notes' }],
  clientRegistration: 'manual',
}
```

- `resources` lists every Resource Server's audience URL. A Resource Server that is not listed cannot receive Access Tokens.
- `scopes` are shown on the Consent Screen. OpenID's `openid`, `profile`, `email`, and `offline_access` are always present.
- `clientRegistration` defaults to `'manual'`: an Administrator creates every Client Application. `'dynamic'` allows unauthenticated self-registration (RFC 7591). `'cimd'` accepts a Client ID Metadata Document at the client's own HTTPS URL. `'dynamic+cimd'` allows both; MCP clients need it, see [ADR 0009](./adr/0009-mcp-clients-register-themselves.md).
- Access Tokens are JWTs bound to one resource and carry the User's `email` and `name`. Resource Servers verify them locally against the Worker's JWKS, so revoking a Grant stops new tokens but does not recall issued ones. They last one hour, better-auth's default. See [ADR 0007](./adr/0007-access-tokens-are-verified-locally-against-jwks.md).
- The JWT plugin's `/api/auth/token` route is disabled (404), so a Session cannot mint a JWT for itself. Access Tokens come only from the OAuth provider's token endpoint after consent.
- The schema always contains the OAuth tables, so turning the role on needs no migration. See [ADR 0008](./adr/0008-the-migration-recipe-is-role-independent.md).

## Signed-in Accounts

```ts
multiSession: { enabled: true, maximumAccounts: 3 }
```

- Off by default; `{}` and `{ enabled: false }` also mean off, and every page is then exactly as without the option.
- `maximumAccounts` caps the Signed-in Accounts per browser, default 5. The account switcher hides "Add another account" at the cap.
- With it on, every page shows an account switcher top-right: switch in place, add another account, sign out of the active one, or sign out of all. Sign-out moves there from the page bodies.
- An Account Switch rewrites the session cookie, so it changes the User for every First-Party app on the Shared Cookie Domain at once, and a consumer app's `signOut()` signs out every account. A browser holds one Signed-in Account per User. See [ADR 0012](./adr/0012-account-switch-is-browser-wide.md).

## Consumer Backend behaviour worth knowing

- A request with an `Authorization` header is treated as a bearer. `resolverLive` with a `resource` verifies it as an Access Token first and never falls back to the cookie when that succeeds. If it is not an Access Token, the same bearer is forwarded to the Auth Worker as a Session, which is how Device Login tokens are accepted. Without `resource`, only the Session check runs.
- `verifyRequest` forwards only the `authorization` or `cookie` header plus `x-forwarded-*` headers, server to server. It throws when the Auth Worker answers with an error status. That is an Authentication Verification Failure, not an absent Session, and the Effect integrations surface it as `Authz.VerificationUnavailable` (503). See [ADR 0002](./adr/0002-http-verification-failures-use-503.md).
- Refreshed cookies come back as separate `Set-Cookie` values. Relaying them is optional. Append each one as its own header; do not join them. See [ADR 0004](./adr/0004-refreshed-cookie-relay-is-keyed-by-name.md).
