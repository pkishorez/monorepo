# Auth Toolkit

One shared sign-in service over better-auth, the Auth Worker, and everything that signs in to it: the Guard both sides of an Effect API import, its server half on a Consumer Backend, and the `Accounts` service a Browser or a Device signs in with. The doors are [ADR 0018](./docs/adr/0018-three-caller-kinds-four-doors.md).

## Language

**Auth Worker**:
The shared authentication service that owns the Primary Database and is the source of truth for sign-in, sign-out, and session validation. Always plays the Identity Role and serves the Home Page, the Login Screen, and the Device Screen; optionally also the Authorization Server Role, in which case it also serves the Consent Screen.
_Avoid_: auth server (ambiguous with any backend that merely talks to it), backend

**Auth Worker Contract**:
What every program talking to the Auth Worker may rely on without running it: where its API and pages live, its issuer and public keys, what an Access Token says about its User, and the shape of a User and a Sign-in. The Auth Worker keeps it; Consumer Backends, First-Party programs, and the Auth Worker's own pages read it.
_Avoid_: shared, common, types

**First-Party**:
A program the deployment owns, in which the User signs in to the product itself: a web app or a CLI. Served by the Identity Role alone; its credential is a Sign-in and there is nothing to register or consent to.
_Avoid_: internal app, our client

**Third-Party**:
A program the deployment does not own that wants to act as the User against a Resource Server, such as an MCP client. Served by the Authorization Server Role; it is an OAuth Client, the User consents to Scopes, and its credential is an Access Token. The First-Party/Third-Party split, not web/CLI/MCP, decides which role and which credential apply.
_Avoid_: external app, integration

**Caller Kind**:
Which of three ways a program reaches a User's data: Browser, Device or OAuth. It decides the credential and how the program signs in; a backend sees all three as one Principal.
_Avoid_: client type, platform, auth mode

**Browser**:
The Caller Kind of a First-Party web app on the Shared Cookie Domain. Its credential is the Auth Worker's cookie, which page code never reads. A web app on any other site is not served.
_Avoid_: web client, cookie auth, frontend

**Device**:
The Caller Kind of a First-Party program that keeps its own credential: a CLI, a TV app, a desktop or mobile app. It signs in through a browser and stores the Sign-in token it gets back.
_Avoid_: CLI auth, native, headless client

**OAuth**:
The Caller Kind of a Third-Party program, such as an MCP client, acting for a User with an Access Token after consent. The toolkit ships nothing for its side; it lives in the Auth Worker's config and on the Resource Server.
_Avoid_: agent (leaves out third-party web apps), MCP auth

**Identity Role**:
The Auth Worker's always-on job: signing Users in and answering "who is this" for a Sign-in, whether it arrives as a browser cookie or a Device Login token. Every deployment has it.
_Avoid_: identity provider, IdP (implies a federation protocol the toolkit does not expose)

**Home Page**:
The Auth Worker's page at `/`. Shows the Active Account who they are, their Sign-ins, and their Grants, and lets them revoke any of them. A signed-out visitor is sent to the Login Screen; there is nothing to see.
_Avoid_: dashboard (collides with better-auth's hosted dashboard), account page

**Sign-in**:
One signed-in instance of a User with an expiry: one browser or one CLI holding a credential the Identity Role recognises. A User has as many Sign-ins as places they are signed in. better-auth calls it a session, and code that speaks better-auth (`kind: 'session'`, `getSession`) keeps that word. A Sign-in is never a Grant. A Browser holds its Sign-ins in the Auth Worker's cookie; a Device holds its token in its Sign-in Store.
_Avoid_: session (that is the app's Session), login (the act, not the record), token (the credential that proves a Sign-in)

**Account**:
A User signed in on this client, as the client sees them: id, email, name and picture, never a token. A client holds at most one per User, up to a configured limit, and can switch between them without signing in again. Each is one Sign-in.
_Avoid_: Signed-in Account, device session (better-auth's term; collides with Device Login), profile, multi-session (implementation name)

**Accounts** (the service):
What a client asks about who is signed in on it: its state (Checking, Signed In with the Active Account and every Account, or Signed Out) and the actions sign in, switch and sign out. Browser and Device each provide it their own way; an app's code is the same for both.
_Avoid_: SignIn (the former name), auth service, Gate (the Web Platform's, now built on this)

**Active Account**:
The one Account the browser currently acts as. Every Browser app on the Shared Cookie Domain and every tab acts as the Active Account; there is no acting as another Account in one tab. The one exception is the Approving Account on the Auth Worker's own Device Screen and Consent Screen.
_Avoid_: current user, current session (a Sign-in, not an account)

**Approving Account**:
The Account a Device Login or a Grant is approved for, picked on the Device Screen or Consent Screen from this browser's Accounts. Picking it switches nothing: it never becomes the Active Account. A Device may hint which Account it wants; a hinted Account not signed in here is offered as a sign-in, which does make it Active. Only the Auth Worker's own pages have it.
_Avoid_: switching to approve, acting account, account selector

**Account Switch**:
Making a different Account the Active Account. Happens on the Auth Worker's pages or from a First-Party web app, and takes effect in every First-Party web app on the Shared Cookie Domain at once. It is never instant: until the Auth Worker confirms it, `Accounts` says it is under way (`SignedIn` with `switchingTo`) and the Account before stays active; one that fails leaves everything as it was. Signing out an Account removes it entirely; there is no "signed out but remembered" state.
_Avoid_: switch user, set active (the endpoint, not the concept)

**Login Screen**:
The Auth Worker's page at `/login`. Only ever about signing in: plainly, "to continue" when a Device Login or an OAuth Client's authorization brought the User here, or to add another Account. A User who is already signed in and has nothing to continue is sent to the Home Page.
_Avoid_: sign-in page, home

**Consent Screen**:
The Auth Worker's page at `/consent`, served with the Authorization Server Role on, where the User grants or denies an OAuth Client its requested Scopes.
_Avoid_: consent page, authorize page

**Device Screen**:
The Auth Worker's page at `/device`, where the User approves a Device Login as an Approving Account. The Device's link carries the code; typing it in is only for a visit by hand.
_Avoid_: device page, verification page

**Test User**:
A User whose email ends in `.test`, a reserved top-level domain no Google account can have. The email is the only mark; nothing else is stored. Every backend refuses one (Forbidden) until its guard opts in with `testUsers: true`; once admitted, a Test User is any User, and `test` on its Principal and Account says which it is.
_Avoid_: test account, demo user, fake user (the Fake's are Fake Accounts)

**Test Sign-In**:
The Auth Worker's second way to sign in, beside Google: naming a Test User's email, with the Worker's key when it sets one. Off unless the deployment sets `testUsers`. Gives a normal Sign-in, so everything after it works as it would for a Google sign-in. `admit` does not apply to it.
_Avoid_: Test Login, dev login, magic login, backdoor

**Fake**:
auth-toolkit's stand-in for the browser environment, where the whole backend runs in the tab and no Auth Worker can be reached: the `fake` door. `fakeAccounts` takes the place of `browser()`, and `fakeGuard.rpc()` and `fakeGuard.http()` of `auth.rpc()` and `auth.http()`. Anyone may be anyone, so it never guards real data.
_Avoid_: Local mode (the former name), mock auth, sandbox

**Fake Account**:
An Account the Fake signs in by naming any email, with no Auth Worker and no identity provider. The same email is always the same User. Switching and signing out work as they would with a real sign-in.
_Avoid_: Local Account, Named Account (the former names), test account (a Test User is a real User at a real Auth Worker)

**Fake Token**:
The token a Fake Account signs each call with, which carries the User it names. `fakeGuard` reads the User straight out of it without asking anyone, so the two sides never share state. Any Fake Token is accepted, and signing out revokes nothing.
_Avoid_: Local Token, Name Token (the former names), test token

**Theme**:
How the Auth Worker's pages are drawn: Light or Dark. Until the visitor picks one, it is the system's. Switched from the toggle in the header of any of its pages, and then kept for that browser across the Shared Cookie Domain.
_Avoid_: colour mode, appearance, dark mode (one of the two), System (not a Theme)

**Device Login**:
How a Device obtains a Sign-in: it opens the Auth Worker's Device Screen in a browser with its code filled in (a CLI asks first, or opens it straight away), the User approves, and the Device receives its token. Always a Sign-in, never an Access Token; no Client Registration, Scopes, or consent are involved.
_Avoid_: device flow, device authorization grant (the Third-Party OAuth grant, which the toolkit does not offer), CLI auth

**Sign-in Store**:
Where a Device keeps its Accounts and their Sign-in tokens between runs: a table the Device chooses (in memory unless it gives one). One token per Account, which never changes, because the Auth Worker slides its expiry on use.
_Avoid_: credentials file (ties the concept to one storage), token cache (nothing is cached; it is the credential itself), refresh token (a Device holds none)

**Authorization Server Role**:
The Auth Worker's opt-in job: letting a Third-Party OAuth Client obtain an Access Token to act on a User's behalf, covering client registration, consent, token issuance, and token verification. Off unless a deployment configures it.
_Avoid_: OAuth provider (collides with Provider), authorization mode

**OAuth Client**:
A Third-Party program of the OAuth Caller Kind that holds an Access Token to act for a User: an MCP client or an approved third-party web app. A Device is not one; it holds a Sign-in through Device Login. Whether it registered itself or was approved by hand does not change what it is.
_Avoid_: Third-Party Client Application (the former name), client (reserved for a First-Party program's side), Provider

**Grant**:
The standing permission a User has given one OAuth Client: which Scopes it may use on the User's behalf. Created when the User accepts on the Consent Screen. Revoking it on the Home Page stops the OAuth Client from obtaining new Access Tokens; the ones it already holds last until they expire. One Grant per OAuth Client per User. Grants are Third-Party only; a Sign-in is never a Grant.
_Avoid_: consent (the act of granting, not the record), connected app, authorization

**Resource Server**:
A Consumer Backend that accepts Access Tokens as well as browser Sign-ins. Every Resource Server is a Consumer Backend; not every Consumer Backend is a Resource Server. An MCP server is one kind of Resource Server.
_Avoid_: API, protected resource (the OAuth wire term; fine in protocol prose, not for the service)

**MCP Server**:
A Resource Server that speaks the Model Context Protocol over stateless Streamable HTTP. Its tools check Scopes, which only a Token Principal has, so a Sign-in gets no further than the endpoint. Every MCP Server is a Resource Server; the reverse is not true.
_Avoid_: MCP endpoint (that is one route of it), tool server, MCP app

**Protected Resource Metadata**:
The discovery document a Resource Server publishes about itself: which Authorization Server issues its Access Tokens and which Scopes it understands. An MCP client reads it, after an unauthenticated challenge, to find the Auth Worker. Published by the Resource Server, never by the Auth Worker.
_Avoid_: resource metadata (ambiguous with the Auth Worker's own metadata), well-known (the path, not the concept)

**Client Registration**:
How an OAuth Client becomes known to the Authorization Server Role before its first authorization: it registers itself at runtime (Dynamic Client Registration) or is identified by a metadata document it hosts at its own URL (Client ID Metadata Document). Both are always on; there is no registering by hand.
_Avoid_: DCR (fine in protocol prose, not for the concept), client onboarding, app registration

**Principal**:
Who one request is from, as `User` gives it. Always names a User; how the User was established (a Sign-in or an Access Token) is part of the Principal, never hidden from it.
_Avoid_: caller, subject

**Sign-in Principal**:
A Principal established by a Sign-in, whether it arrived as a browser cookie or a Device Login token. Carries the User and the Sign-in (`kind: 'session'`, after better-auth). Every First-Party program yields one.
_Avoid_: Session Principal, cookie user, web principal

**Token Principal**:
A Principal established by an Access Token. Carries the User, the OAuth Client acting for them, and the granted Scopes. Has no Sign-in.
_Avoid_: bearer (better-auth's `bearer` plugin means something else), API user

**Access Token**:
The credential the Authorization Server Role issues to an OAuth Client for one Resource Server, presented in the Authorization header. Short-lived; a refresh token renews it.
_Avoid_: bearer token, JWT (the format, not the concept), API key

**Scope**:
A named permission a User grants an OAuth Client at consent time and an Access Token carries. A Resource Server may require Scopes through an Authorization Policy; a Sign-in Principal has none.
_Avoid_: permission (reserved for what an Authorization Policy decides), role

**Consumer Backend**:
Any service (other than the Auth Worker itself) that needs to know whether an incoming request is authenticated. Talks to the Auth Worker over HTTP through `auth.rpc()` or `auth.http()` from `@kestack/auth-toolkit/server` — it never touches the Primary Database directly. A Backend is one.
_Avoid_: server, app, client (reserved for the browser side)

**Primary Database**:
The durable store holding users, linked accounts, sessions, and verification records.
_Avoid_: database, primary storage

**Administrator**:
A User granted the `admin` role and therefore allowed to manage users and sessions through the Auth Worker. Using the hosted dashboard does not by itself make a User an Administrator.
_Avoid_: dashboard user, admin user

**User Admission Policy**:
An optional rule that accepts or rejects an identity when it first registers, links an account, or starts a fresh provider sign-in. It does not continuously re-evaluate existing sessions; banning handles an already-admitted User. It does not apply to Test Users.
_Avoid_: invariant, user validation

**Server-Side Verification**:
A Consumer Backend forwarding an incoming request's cookies/headers server-to-server to the Auth Worker to validate it, getting back a Verify Payload. No CORS applies here — it's not a browser call.
_Avoid_: forwarding, proxying (proxying implies relaying the response back to the browser, which is optional here, not implied by the term)

**Current**:
The verified Principal available while handling one guarded call in a Consumer Backend: `User`.
_Avoid_: CurrentAuth (the former name), current user (omits how the User was established), auth context (easily confused with Effect's Context)

**Resolver**:
The part of a backend's guard that finds out who a request is from: `auth.rpc()` and `auth.http()` ask the Auth Worker (Server-Side Verification for a cookie or Device token, a local check for an Access Token), and the Fake's `fakeGuard` reads a Fake Token. Handlers' tests use `fakeGuard.rpc({ as })` or `fakeGuard.http({ as })`, which have a fixed Principal behind every call.
_Avoid_: `authz.cloud`, `authz.device` (the former names), auth provider, RPC verifier

**Unavailable**:
The Consumer Backend could not find out who called because Server-Side Verification was unavailable: `Unavailable`, a 503. Different from a call nobody signed (`Unauthenticated`).
_Avoid_: VerificationUnavailable (the former name), unauthenticated request, invalid session

**Account Changed**:
A Browser call refused because the cookie's Active Account is not the User the call expected (`expect-user`): another tab switched. The client re-checks its Accounts; nothing was done as the wrong User.
_Avoid_: stale session, wrong user, conflict

**Guard**:
auth-toolkit's Middleware (see rpc-toolkit), the same for Effect RPC and Effect HttpApi, imported by both sides from the toolkit's root as `Authz`. `Authz.required` is an Authentication Requirement; `Authz.scope` and `Authz.policy` carry an Authorization Policy. Which value applies follows rpc-toolkit's Nearest Wins. Its server half is the backend's one `auth.rpc()` or `auth.http()` Layer; its client half comes with the `client/browser` and `client/device` Layers, which sign every guarded call without the app asking.
_Avoid_: `Auth`, `AuthzHttp`, Auth Cannotation (the former names), auth middleware

**Authentication Requirement**:
A Guard without a value: the endpoint may run only for a known caller. It establishes identity but imposes no additional permission rule.
_Avoid_: auth policy (reserved for authorization)

**Authorization Policy**:
The value a Guard carries: a rule that decides whether the caller may perform the endpoint. Usually built from an invariant and a failure reason; underneath it is an Effect that fails with Forbidden.
_Avoid_: permission boolean, auth check

**Shared Cookie Domain**:
The parent domain (e.g. `.example.com`) the Auth Worker's session cookie is scoped to, so any subdomain's Direct Sign-in Check can read it. Configurable per deployment.
_Avoid_: cookie domain (kept for the config field name; this term is for the concept in prose)

## Internals

Words for how the toolkit works inside, which a program using it never needs.

**Cookie Cache**:
A signed, short-TTL blob better-auth writes into the session cookie itself, letting the Auth Worker (and nothing else) confirm "logged in, as whom" without a Primary Database read. Lives entirely inside the cookie — it is not a server-side cache.
_Avoid_: session cache, server cache

**SQLite Dialect Group**:
The Providers that speak SQLite for the Primary Database — currently D1 and the in-memory Provider — sharing one Common schema and Migration Recipe since the SQL is identical regardless of which SQLite actually runs it. A non-SQLite dialect (e.g. Postgres) would be its own sibling group with its own Common, not a member of this one.
_Avoid_: sqlite (lowercase, the subpath segment — this term is for the concept in prose)

**Common** (within a dialect group):
The one schema and Migration Recipe every Provider in a dialect group is built on — owned by neither Provider, so neither hand-maintains its own copy that could drift from the other's.
_Avoid_: shared, base

**Migration Recipe**:
The committed generated schema and SQL migrations a dialect group's Common ships. Package maintainers regenerate both with the single `pnpm db:generate` command after changing the Auth Worker's model; normal builds only package them. There is no separate apply step for D1 — alchemy applies the shipped files on every deploy.
_Avoid_: migrations (too generic on its own — use this term when referring to a Common's own shipped recipe, not a consumer's ad hoc SQL)

**Provider**:
An interchangeable implementation of the Primary Database. A consumer chooses one Provider for its Auth Worker.
_Avoid_: adapter (kept as the better-auth/drizzle term for the thing a Provider builds, not for the Provider itself), backend

**Direct Sign-in Check**:
A Browser app calling the Auth Worker itself, with the cookie, to list its Accounts (without tokens), sign in, switch, and sign out. Allowed from any origin under the Shared Cookie Domain.
_Avoid_: Direct Session Check (the former name), proxied check (that's the separate Server-Side Verification path)

**Verify Payload**:
What Server-Side Verification returns to a Consumer Backend: the validated session/user data plus any refreshed cookie value. Whether the Consumer Backend relays that refreshed cookie back to the browser is the Consumer Backend's own choice — the Auth Worker utility only hands it over.
_Avoid_: response (too generic)

**Batched RPC Request**:
One HTTP request carrying multiple RPC calls. Its calls share one verification and the refreshed cookies.
_Avoid_: parallel RPCs

**Concurrent RPC Calls**:
Independent RPC requests running at the same time. Each request verifies and carries its own caller.
_Avoid_: parallel RPCs

The Gate, the Backends, each Account's Session and the device's Cache are the Web Platform's words: see [its glossary](../../platforms/web-platform/CONTEXT.md).
