# auth-toolkit redesign

> **Superseded in part.** The contract's `Auth` is now `Authz` ([ADR 0020](./adr/0020-one-guard-for-both-protocols-as-authz.md)), rpc-toolkit's `Rpc.*` namespaces are a door per Transport ([rpc-toolkit ADR 0005](../../rpc-toolkit/docs/adr/0005-one-door-per-transport-named-exports.md)), Local mode became the `fake` door ([ADR 0022](./adr/0022-test-users-at-the-auth-worker-local-mode-becomes-the-fake.md)), and `server/rpc`, `server/http` and `testAuth` became one `server` door with `auth.rpc` and `auth.http`, beside `fakeGuard.rpc({ as })` and `fakeGuard.http({ as })` ([ADR 0023](./adr/0023-one-server-door-guards-per-protocol.md)). The rest stands as the record of the design session.

The target API and behaviour agreed in the 2026-10-19 design session. Vocabulary is in [CONTEXT.md](../CONTEXT.md); the two decisions that shape it are [ADR 0018](./adr/0018-three-caller-kinds-four-doors.md) and [ADR 0019](./adr/0019-browser-callers-are-same-site-and-never-hold-tokens.md). This is a clean break: no compatibility shims, no deprecated aliases. The database schema changes only by additive migrations.

## As built

The toolkit now matches this spec. Where the build differs from the session's first draft, the text below says what was built, and these are the differences worth knowing:

- rpc-toolkit gained `Rpc.onExit`, so a client middleware can run the `Accounts` re-check before a refused call's failure reaches its caller, over any Transport. HttpApi clients re-check on the response status instead.
- `server/http`'s `oauth` also takes `scopes`, published as `scopes_supported` in the Protected Resource Metadata. `server/rpc`'s `oauth` is `{ resource }` only.
- `./worker/alchemy` exports `d1Database(id, { name? })`.
- The Device Screen link is `/device?code=…&account=…`, built by the toolkit, not better-auth's `verification_uri_complete` (`?user_code=`).
- The test Layer is `testAuth(principal)`, exported by both `server/rpc` and `server/http`; `null` means nobody.
- `verify(request, options)` is a Promise only, and takes any `auth()` options, `local: true` included.

## Mental model

Three Caller Kinds. **Browser**: a same-site web app, credential is the Auth Worker's cookie, page JS never sees a token. **Device**: CLI, TV, desktop, mobile; holds its own Sign-in token in storage it chooses. **OAuth**: someone else's program (MCP client) with an Access Token after consent; the toolkit ships nothing for its side.

## Doors (package.json `exports`)

| Door               | What                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `.`                | The contract both sides import: `Auth`                                                            |
| `./server/rpc`     | `auth(options)` for Effect RPC (rpc-toolkit `Rpc`)                                                |
| `./server/http`    | `auth(options)` for Effect HttpApi (rpc-toolkit `HttpApi`), plus plain `verify(request, { url })` |
| `./client`         | The `Accounts` service tag, its state and types                                                   |
| `./client/browser` | `browser(options)`: `Layer<Accounts>` over the cookie                                             |
| `./client/device`  | `device(options)`: `Layer<Accounts>` over stored tokens                                           |
| `./worker`         | `authWorker(config)`, `d1(binding)`                                                               |
| `./worker/memory`  | `memory()` in-memory Primary Database for tests                                                   |
| `./worker/alchemy` | `d1Database(id, { name? })`: the D1 resource with migrations attached                             |

Gone: `./guard`, `./server`, `./server/cloud`, `./client/web`, `./client/cli`, `Authz`, `AuthzHttp`, `authz.*`, `SignIn`, `signIn.named`, `DeviceCode`, `createMcpResourceServer`, `verifyAccessToken`, `verifyRequest`, `isTrustedOrigin`, `validateTrustedOrigins`, `AUTH_PAGES`, the email-privacy store, Test Sign-In.

## `.` — the contract

- `Auth` is one name used on both RPC groups/endpoints and HttpApi groups/endpoints, built on rpc-toolkit Middleware (Nearest Wins applies). `Auth.required` (Authentication Requirement), `Auth.scope(...names)` and `Auth.policy(invariant, reason)` (Authorization Policies). If rpc-toolkit's two Siblings truly cannot share one value, the fallback is the smallest possible split (e.g. one `Auth` object whose members accept either Sibling's group); never two top-level names.
- `Auth.User`: the Principal for the call (tag). Principal still says how the User was established: Sign-in (`cookie` or Device token) or Access Token (OAuth Client + scopes).
- Inside a handler, `yield* Auth.scope('x')` also works as an Effect check (needed by MCP tools that share one endpoint).
- Errors: `Unauthenticated` 401, `Forbidden` 403, `Unavailable` 503, `AccountChanged` 409.
- Safe to import in a browser bundle: no server code.

## `server/rpc` and `server/http`

```ts
auth({ url }); // the Auth Worker
auth({ url, oauth: { resource: 'https://mcp.example.com' } }); // also accepts Access Tokens for that resource
auth({ url, oauth: { resource, scopes: ['notes:read'] } }); // server/http only: publishes scopes_supported
auth({ local: true }); // Local mode: reads Local Tokens, no Auth Worker
```

One value per server. It does everything `authz.layer` + `authz.cloud` + `authz.cookies` did: read the credential (cookie, or bearer), verify (Server-Side Verification for a cookie/Device token, local JWKS check for an Access Token), verify once per Batched RPC Request, relay refreshed cookies onto the response, apply the Guard, provide `Auth.User`, map failures to 401/403/503. The URL is given once. If rpc-toolkit's server signature needs a small change so one value suffices, change rpc-toolkit.

**expect-user**: a Browser call carries an `expect-user: <userId>` header. When the cookie's Active Account is a different User, the call fails `AccountChanged` before the handler runs. Bearer callers ignore it.

`server/http` with `oauth` also serves Protected Resource Metadata (`/.well-known/oauth-protected-resource[/path]`, CORS `*`) and answers unauthenticated calls with the `WWW-Authenticate` challenge MCP clients follow. An MCP server is `server/http` + `oauth`; tools check scopes with `Auth.scope` inside.

`verify(request, options) → Promise<Principal | null>` (from `server/http`, same options as `auth()`) is the one plain escape hatch (raw WebSocket upgrades, non-Effect code). `testAuth(principal)` from either door is the test Layer for handlers' tests; nothing else.

## `client`, `client/browser`, `client/device`

`Accounts` (Effect service), the same for both:

```ts
state: Stream<AccountsState>        // also a current-value getter
// AccountsState = Checking { last?: Account } | SignedIn { active: Account, accounts: Account[] } | SignedOut
signIn(options?), switchTo(userId), signOut(userId?), signOutAll, check
```

An Account is a User (id, email, name, image) — never a token. Accounts are keyed by userId.

**browser({ url, cache?, local? })**

- Talks to the Auth Worker with `credentials: 'include'` (Direct Sign-in Check). Lists Accounts without tokens.
- `cache`: opt-in StdTable adapter remembering the Accounts last signed in (no tokens). With it, `state` starts `Checking { last }` so an app can open at once, then confirms. Without it, `Checking {}`. A signed-out answer does not forget them, so an Auth Worker that answers signed out for a moment (restarting) does not cost the next start its Account; they are forgotten by a sign-out asked here (`signOut` of the last Account, `signOutAll`) or by a signed-out answer to the check made while they were shown, so a sign-out elsewhere shows the old Account at most once more.
- Re-checks on start and whenever the tab becomes visible. A BroadcastChannel tells other tabs of switch/sign-in/sign-out at once.
- Provides the RPC/HTTP client middleware that sends `expect-user` with the active userId and cookies. On `AccountChanged`, re-check before the failure reaches the caller (RPC through rpc-toolkit's `Rpc.onExit`, HttpApi by status).
- `local: { choose, storage? }`: Local mode. Local Accounts in a StdTable (`localAccountsTable`, memory unless `storage` is given), `choose` is an app-provided Effect answering "who signs in" (`localChooser()` makes one a dialog answers). Calls carry the Local Token as a bearer. No Auth Worker.
- `cache` is a Layer of `browserAccountsTable` on any StdTable adapter.
- `signIn()` leaves the page for the Login Screen / Google; it never completes in place.

**device({ url, app, version?, storage?, maxAccounts?, open?, show? })**

- `storage`: a Layer of `deviceAccountsTable` on a StdTable adapter (SQLite on a CLI, secure storage on mobile), in memory by default. `show` replaces the terminal prompt (a TV or phone shows the code its own way). Holds every Account and its one Sign-in token (sliding expiry; no refresh token). Several Accounts, one active, limit as the browser.
- `signIn({ account?: email, open?: 'prompt' | 'auto' })`: Device Login. Opens `/device?code=…&account=…` on the Auth Worker. `'prompt'` (default) prints URL + code and "press o to open"; `'auto'` opens the browser at once; without a TTY just prints. Polls until approved, stores the token, makes it active.
- Provides the client middleware that signs every guarded call with the active Account's bearer, automatically. `Auth.bearer` is no longer user-facing.
- `signOut` revokes on the Auth Worker and deletes from storage.

## `worker`

```ts
authWorker({
  url, secret, google: { clientId, clientSecret }, database: d1(env.DB),
  cookieDomain: '.example.com',         // required; trust = any origin under it (no trustedOrigins)
  brand: { name, logo?, accent? },      // accent: one colour for primary button + focus ring
  maxAccounts?: 5, admit?: (user) => ..., dashApiKey?,
  oauth?: { resources: { 'https://mcp.example.com': { 'notes:read': 'Read your notes' } } },
})
```

- OAuth Clients self-register (dynamic + CIMD). No other registration choice.
- Cookie cache fixed at 5 minutes. Rate limits unchanged.
- **Approving Account**: the Device Screen and Consent Screen approve as a chosen Account without switching. Worker-internal endpoints take `{ userCode | consent ids, userId }`, pick that User's session from this browser's multi-session cookies on the server, and call better-auth (`/device/verify` + `/device/approve`, oauth-provider consent) with that session as a bearer. No token reaches the page; the Active Account does not change. better-auth binds a device code to the first signed-in viewer of `/device/verify` (`routes.mjs:529`), so the page must not look the code up through better-auth until Approve.
- Device sign-ins should be nameable on the Home Page: the Device sends a User-Agent like `<app>/<version> (<hostname>)`.

## Worker pages (rebuilt on Kabuki)

A Kabuki app (`@kestack/kabuki`, Start on `cloudflare()`), still bundled into the worker as embedded assets (ADR 0006), replacing TanStack Start. Uses the browser `Accounts` service where it fits. Follow the emil design skills (design-foundations, forms-and-inputs, ui-polish); the rules they settle into are [`design.md`](./design.md). No email-hiding eye; no Test Sign-In UI.

- **Data**: every page arrives with its data. Each page is `dynamic`, and its Loader runs in the Auth Worker itself, reading this browser's Accounts, Sign-ins, Grants, the Device Login code (looked up, never claimed) and the consent request in-process from the request's cookies (`PagesContext.reads`); no token reaches the page (ADR 0019). A first visit paints complete. A move between pages is held up to the Router's 150 ms, then one page-level placeholder shows for at least 300 ms and the page fades in (its Frame, on `status.waited`). After an action (a removed Sign-in or Grant) the page reloads behind what is shown; an Account Switch, signing out of an Account, or another tab's change seen when the page is shown again reload it anew, so one Account's data never stays under another; a page shown again while its data is still on its way is checked once it arrives. The pages keep no Data cache copies (`cacheSize: 0`): nothing in the browser says another tab or app switched Account before a request does, so Back and Forward read the data again, for whoever is active now. Login and consent carry the authorization's signed query whole as a `Page.wholeQuery` field, so a move between them keeps it, and their Loaders read it from the place's params, never the Referer.
- **Layout**: every page has the same header (product name left; right, the Theme toggle and, once signed in, the Account menu, its slot held while loading) and a top-aligned column at the same height; nothing is vertically centred. Two templates: the Home Page's 640px column, and a 400px task column for every single-task page (login, device, consent, error, not found), which opens with a 44px mark, the title and one line of why.
- **Theme**: light or dark, one icon button in the header next to the Account menu on every page, signed in or out; it shows the Theme it switches to. No "System" choice: until the visitor presses it, the pages follow the system's `prefers-color-scheme`, resolved by a head script before the first paint (no flash). Pressing it writes `theme=light|dark` on the Shared Cookie Domain (`cookieDomain`), which the Auth Worker reads into the pages context for the server's render.
- **Account menu**: one avatar menu, top-right on every signed-in page, after the Theme toggle. Accounts with a check on the active one, each with a sign-out row action; "Add another account"; last, "Sign out of all accounts". Choosing an Account here switches (real Account Switch).
- **/login**: a sign-in mark, "Sign in to {App}" or "Sign in to continue to {Client}" (OAuth/Device context) or "Add another account"; one "Continue with Google" button. Errors inline. Keeps `return_to` everywhere, including from `/` and `/error`.
- **/**: header with app name + account menu. "Where you're signed in": human names ("Chrome on macOS", "acme-cli on laptop"), this browser's Sign-in pinned first in its own "This browser" group ("You're using it now"), the rest under "Other browsers and devices" with last active, per-row Sign out (immediate + toast), "Sign out everywhere else" in that group's header, shown with two or more others (the only confirmation dialog). "Apps with access": app, scopes in words, date, Remove access (immediate + toast); a real empty state. Single column, ~640px.
- **/device**: with the code in the link, go straight to "Sign in to {app}?" showing the code to compare and the Approving Account picker (preview only, switches nothing), Approve (primary) / Cancel. Code entry only when visited by hand. If `account` hint is signed in here, preselect it. If not: inline warning (icon + text) "{email} isn't signed in on this browser." with primary "Sign in as {email}" (Google with login hint, returns to this approval with it selected) and a secondary "approve as {other} instead". No Accounts → only the sign-in. Done: "You're signed in on {app}. You can close this tab." Errors specific, never a permanently disabled form.
- **/consent**: "{Client} wants to use your {App} account", Approving Account picker (preview only), scopes in plain words, Allow (primary) / Cancel (secondary).
- **/error**, not found: say what happened and offer the specific way back, keeping `return_to`.

## Consumers (same stack of work)

- `platforms/web-platform`: Gate rebuilt on `Accounts` state (XState removed); app-facing React API may stay but is fed by `Accounts`; server wiring uses `server/rpc`/`server/http` `auth()`; Durable Object/live wiring uses cookies (drop `?access_token=`); "Device Backend" → "Local Backend" (stored/launched `device` read as `local`).
- `apps/alchemy-console`: server via `server/rpc` `auth({ url })`, client via `client/browser`.
- `packages/effect-webrtc`: `verify` from `server/http`; its origin check lives in effect-webrtc itself.

## Done means

`pnpm lint` and `pnpm test` pass in every touched package (`laymos lint` included); README follows `docs/readme-conventions.md`; `docs/auth-worker-configuration.md` matches the new config; one changeset bumping every changed package by `patch`.
