# Auth Worker configuration

What each `authWorker` option does, and the behaviour a deployment inherits
whether or not it sets anything. Vocabulary follows
[`CONTEXT.md`](../CONTEXT.md).

```ts
import { authWorker, d1 } from '@kestack/auth-toolkit/worker';

const { handler } = authWorker({
  url: 'https://auth.example.com',
  secret: env.AUTH_SECRET,
  google: { clientId: env.GOOGLE_ID, clientSecret: env.GOOGLE_SECRET },
  database: d1(env.DB),
  cookieDomain: '.example.com',
  brand: { name: 'Example', logo: 'https://example.com/logo.svg' },
});
```

## Options

| Option         | Effect                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`          | The Auth Worker's own public URL. Its host must be under `cookieDomain`.                                                                                                                                  |
| `secret`       | The better-auth secret. Rotating it signs every User out.                                                                                                                                                 |
| `google`       | Google OAuth client id and secret. Google is the only identity provider.                                                                                                                                  |
| `database`     | The Primary Database: `d1(env.DB)` in production, `memory()` from `@kestack/auth-toolkit/worker/memory` in tests. Sessions and verification records live here.                                            |
| `cookieDomain` | Required. The Shared Cookie Domain, for example `.example.com`. The session cookie is scoped to it, and it is the only trust rule: any origin under it is trusted, no other origin is. See "Trust" below. |
| `brand`        | What the pages show: `name` ("Sign in to {name}"), an optional `logo` URL (also the favicon), and an optional `accent`, one CSS colour for the primary button and the focus ring.                         |
| `maxAccounts`  | Accounts one browser may hold. Defaults to 5. Must be a positive integer.                                                                                                                                 |
| `admit`        | The User Admission Policy: `(user: { email, name }) => boolean`, sync or async. See below.                                                                                                                |
| `dashApiKey`   | Connects the Worker to better-auth's hosted dashboard. Absent or blank leaves it off.                                                                                                                     |
| `oauth`        | Turns on the Authorization Server Role: `{ resources: { [url]: { [scope]: description } } }`. See below.                                                                                                  |
| `testUsers`    | Turns on Test Sign-In: `{ key?, allow? }`. Omitted, it does not exist. See "Test Users" below.                                                                                                            |

`authWorker` throws at startup on a missing `secret` or `brand.name`, a `url`
that is not absolute or not under `cookieDomain`, a `cookieDomain` that is
not a bare domain, a bad `maxAccounts`, a resource key that is not a URL, an invalid
scope name, one scope described two different ways, a `testUsers.key` that is
not a non-empty string, or a `testUsers.allow` that is not a function.

It returns `{ auth, handler }`: the better-auth instance, for server-side
calls, and the fetch handler that serves `/api/auth/*`, the pages, and their
assets.

## Always on

- **Admin plugin.** Lets the hosted dashboard persist and enforce bans. It does not expose the Admin client API and does not bootstrap Administrators.
- **Rate limiting is disabled.** better-auth's built-in rate limiter is off. Put rate limiting in front of the Worker if you need it.
- **Accounts.** better-auth's `multiSession` plugin runs on every deployment, capped at `maxAccounts`.
- **Device Login.** The `deviceAuthorization` and `bearer` plugins run on every deployment. A Device's token is a Sign-in sent as a bearer, not an Access Token. A Device should send a User-Agent of `<app>/<version> (<hostname>)` so the Home Page can name it "<app> on <hostname>".
- **Cookie Cache.** Fixed at five minutes. See "Revocation lag".
- **Pages.** The handler serves `/`, `/login`, `/device`, `/consent` and `/error` from the prebuilt Kabuki pages app with embedded assets; no assets binding and no build step in the consumer. Any other path draws a not-found page with a 404. Without `oauth` nothing sends a User to `/consent`, and its endpoints answer 404. With `oauth` the handler also serves `/.well-known/*`.
- **No tokens to pages.** No response a browser can get carries a Sign-in token: `token` fields are removed from better-auth's JSON (`get-session`, `list-sessions`, `multi-session/list-device-sessions`, `multi-session/set-active`, sign-in answers) and the bearer plugin's `set-auth-token` header is dropped. The exceptions issue a credential on purpose to a program that is not a page: `/device/token` (Device Login), `/oauth2/*` (OAuth Clients) and `/dash/*` (the hosted dashboard). See [ADR 0019](./adr/0019-browser-callers-are-same-site-and-never-hold-tokens.md).

## Trust

`cookieDomain` decides trust. An origin is trusted when its host is the
domain itself or any subdomain of it, at any depth, over `https`; `http` is
trusted only when the Worker's own `url` is `http` (local development). The
opaque origin `null` never is. The same rule drives:

- the credentialed CORS headers on `/api/auth/*` (an untrusted preflight gets 403);
- better-auth's origin and redirect checks (`trustedOrigins` is derived, not configured);
- the Worker's own state-changing endpoints below, which refuse a `POST` whose `Origin` is missing or untrusted.

A web app on another site is not served. There is no `trustedOrigins`.

## User Admission Policy

`admit` runs when an identity registers, links an account, or starts a fresh
Google sign-in. Return `true` to admit; anything else refuses with
"This account cannot sign in here." A thrown error fails closed. The policy
does not re-evaluate existing Sign-ins; ban an already-admitted User instead.

## Test Users

A Test User is a User whose email ends in `.test`. The reserved top-level
domain means no Google account can have one, so the email is the only mark:
nothing else is stored, and there is no migration.

With `testUsers` set, `POST /api/auth/test/sign-in` with
`{ email, key? }` signs the browser in as that Test User without Google,
creating the User on first use. It is a normal Sign-in with the normal
session cookie, so Accounts, Account Switch, sign-out, Device Login and the
Consent Screen work unchanged. The Login Screen offers "Sign in as a test
user" below the Google button.

```ts
testUsers: {
  key: env.TEST_USERS_KEY, // optional: every Test Sign-In must send it
  allow: (email) => email.endsWith('@acme.test'), // optional
}
```

- Without `key`, no key is needed. With it, the request must carry exactly that key (401 `WRONG_KEY`).
- `allow`, when set, gets the email trimmed and lowercased; `false` refuses it (403 `NOT_ALLOWED`).
- An email that is not a `.test` email is always refused (400 `NOT_A_TEST_EMAIL`).
- A browser already holding `maxAccounts` Accounts may sign in again as one of them, but not as another (403 `TOO_MANY_ACCOUNTS`).
  Two sign-ins sent at once from the same cookies can both pass this check, as two Google sign-ins can.
- A User's email never moves into or out of `.test`, not even by an Administrator's update, so a real User never becomes a Test User or the other way round.
- A Test User can approve OAuth consent like any User. auth-toolkit's guards refuse their Access Tokens unless `testUsers: true`; a Resource Server that checks tokens some other way must refuse them itself.
- `admit` does not apply to Test Users. Google sign-in refuses a `.test` email, with or without `admit`.
- The answer is `{ user }`, never a token. Given the Login Screen's signed `oauth_query`, it answers `{ redirect, url }` to carry on the authorization, as a Google sign-in would.

A Consumer Backend still refuses Test Users until it opts in with
`testUsers: true` on its guard. Both are off by default.

## Revocation lag

The Cookie Cache lets the Auth Worker confirm a Sign-in from the cookie
alone for up to five minutes. A revoked Sign-in can therefore keep working
in another browser until its cache expires. A cache miss reads the Primary
Database. There is no secondary storage; see
[ADR 0005](./adr/0005-auth-state-uses-only-the-primary-database.md).

## Authorization Server Role

```ts
oauth: {
  resources: {
    'https://mcp.example.com': { 'notes:read': 'Read your notes' },
    'https://api.example.com': { 'notes:write': 'Create and edit notes' },
  },
}
```

- Each key is a Resource Server's audience URL; one that is not listed cannot receive Access Tokens.
- Each value lists the Scopes that resource understands, in the words the Consent Screen and the Home Page show. OpenID's `openid`, `profile`, `email` and `offline_access` are always offered, with words of their own.
- OAuth Clients register themselves: Dynamic Client Registration (unauthenticated, RFC 7591) and Client ID Metadata Documents are both on, and there is no other choice. MCP clients need both; see [ADR 0009](./adr/0009-mcp-clients-register-themselves.md). A registration whose redirects are all plaintext loopback URLs is treated as a native app.
- Refresh tokens turn over on every use. Presenting a spent one revokes every refresh and Access Token that client holds for that User. Removing a Grant revokes its refresh and Access Token records; a JWT Access Token already issued still lives until it expires.
- Access Tokens are JWTs bound to one resource and carry the User's `email` and `name`. Resource Servers verify them locally against the Worker's JWKS. They last one hour. See [ADR 0007](./adr/0007-access-tokens-are-verified-locally-against-jwks.md).
- The JWT plugin's `/api/auth/token` route is disabled (404), so a Sign-in cannot mint a JWT for itself.
- The schema always contains the OAuth tables, so turning the role on needs no migration. See [ADR 0008](./adr/0008-the-migration-recipe-is-role-independent.md).

## The Worker's own endpoints

Below `/api/auth`, for the Worker's pages and for a First-Party web app's
`Accounts`. All take and return JSON, are keyed by userId or Sign-in id, and
never return a token. Every `POST` needs a trusted `Origin` and
`content-type: application/json`. Failures answer
`{ error, message }` with a 4xx status.

| Endpoint                       | Does                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `GET /accounts`                | This browser's Accounts and the Active Account.                                                            |
| `POST /accounts/switch`        | Account Switch to `userId`.                                                                                |
| `POST /accounts/sign-out`      | Signs `userId` out of this browser; when it was active, the next Account becomes active.                   |
| `GET /sign-ins`                | The Active Account's Sign-ins, named ("Chrome on macOS", "acme-cli on laptop"), this browser's marked.     |
| `POST /sign-ins/revoke`        | Ends one of the Active Account's Sign-ins by `id`. This browser's own is the same as `/accounts/sign-out`. |
| `POST /sign-ins/revoke-others` | Ends every Sign-in of the Active Account except this browser's.                                            |
| `GET /grants`                  | The Active Account's Grants, with the OAuth Client and each Scope in words. Empty without `oauth`.         |
| `POST /grants/revoke`          | Removes one Grant by `id`.                                                                                 |
| `GET /device/request`          | What a Device Login code asks for, read without claiming it.                                               |
| `POST /device/answer`          | Approves or denies a code as the Approving Account `userId`.                                               |
| `GET /consent/request`         | What an authorization asks for, from the Consent Screen's signed query.                                    |
| `POST /consent/answer`         | Grants or refuses it as the Approving Account `userId`; answers the URL to send the browser to.            |

The Approving Account endpoints act as an Account other than the Active
Account without switching: the Worker picks that User's session out of this
browser's multi-session cookies and calls better-auth with it as a bearer,
on the server. `userId` must be signed in on this browser.

Who may call: the Accounts endpoints are open to every trusted origin, for a
First-Party app's `Accounts`. The rest of the `POST`s (revoking Sign-ins and
Grants, both answers) and better-auth's own `/device/approve`,
`/device/deny` and `/oauth2/consent` take only the Worker's own origin
(403 otherwise). `/device/code` and `/device/token` refuse any browser (a
request with `Origin` or `Sec-Fetch-Site`): a Device calls them from a
program.

The Home Page's revokes also send `userId`, the Account the page shows. When
the Active Account is someone else by then (another tab switched), they
answer 409 `account_changed` and change nothing.

better-auth claims a Device Login code for the first signed-in viewer of its
own `GET /device`, so the Device Screen reads a code with
`/device/request` and claims it only at `/device/answer`, for the chosen
Account. A code another Account of this same browser claimed is handed to
the chosen one; a code claimed by anyone else stays theirs (403).

## Consumer Backend behaviour worth knowing

- A request with an `Authorization` header is treated as a bearer: an Access Token where the backend accepts them, otherwise a Device's Sign-in, checked with the Auth Worker. A Browser call carries the cookie and never a bearer.
- Server-Side Verification forwards only the `authorization` or `cookie` header plus `x-forwarded-*` headers, server to server. An error status from the Auth Worker is an Authentication Verification Failure, surfaced as `Unavailable` (503), not an absent Sign-in. See [ADR 0002](./adr/0002-http-verification-failures-use-503.md).
- Refreshed cookies come back as separate `Set-Cookie` values. Append each one as its own header; do not join them. See [ADR 0004](./adr/0004-refreshed-cookie-relay-is-keyed-by-name.md).
