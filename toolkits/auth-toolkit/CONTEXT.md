# Auth Toolkit

One shared sign-in service over better-auth, the Auth Worker, and everything that signs in to it: the guard both sides of an Effect API import, its server half on a Backend, and the client that runs sign-in on a device. Named changes since the three-doors decision are listed in [ADR 0005](../../docs/adr/0005-three-toolkits-three-doors.md).

## Language

**Auth Worker**:
The shared authentication service that owns the Primary Database and is the source of truth for sign-in, sign-out, and session validation. Always plays the Identity Role and serves the Home Page, the Login Screen, and the Device Screen; optionally also the Authorization Server Role, in which case it also serves the Consent Screen.
_Avoid_: auth server (ambiguous with any backend that merely talks to it), backend

**Auth Worker Contract**:
What every program talking to the Auth Worker may rely on without running it: where its API and pages live, its issuer and public keys, what an Access Token says about its User, and the shape of a User and a Sign-in. The Auth Worker keeps it; Consumer Backends, First-Party programs, and the Auth Worker's own pages read it.
_Avoid_: shared, common, types

**First-Party**:
A program the deployment owns, in which the User signs in to the product itself: a web app, a CLI, or a native app. A web app or a CLI is served by the Identity Role alone; its credential is a Sign-in and there is nothing to register or consent to. A native app is a First-Party Client.
_Avoid_: internal app, our client

**First-Party Client**:
A First-Party native app that signs Users in as an OAuth client, because it can neither share the browser's cookie nor ask for a code on another screen. The deployment lists it, with its exact redirects and its own Resource Server; it never sees the Consent Screen, and each User signed in to it holds their own Access Token and refresh token on the device. Not a Client Application: nobody registers it and nobody consents.
_Avoid_: native client, mobile client, trusted client

**Third-Party**:
A program the deployment does not own that wants to act as the User against a Resource Server, such as an MCP client. Served by the Authorization Server Role; it is a Client Application, the User consents to Scopes, and its credential is an Access Token. The First-Party/Third-Party split, not web/CLI/MCP, decides which role and which credential apply.
_Avoid_: external app, integration

**Identity Role**:
The Auth Worker's always-on job: signing Users in and answering "who is this" for a Sign-in, whether it arrives as a browser cookie or a Device Login token. Every deployment has it.
_Avoid_: identity provider, IdP (implies a federation protocol the toolkit does not expose)

**Home Page**:
The Auth Worker's page at `/`. Shows the Active Account who they are, their Sign-ins, and their Grants, and lets them revoke any of them. A signed-out visitor is sent to the Login Screen; there is nothing to see.
_Avoid_: dashboard (collides with better-auth's hosted dashboard), account page

**Sign-in**:
One signed-in instance of a User with an expiry: one browser or one CLI holding a credential the Identity Role recognises. A User has as many Sign-ins as places they are signed in. better-auth calls it a session, and code that speaks better-auth (`kind: 'session'`, `getSession`) keeps that word. A Sign-in is never a Grant. How it is made is the Sign-in mechanism: `cookie`, `oauth`, `named` or `deviceCode`.
_Avoid_: session (that is the app's Session), login (the act, not the record), token (the credential that proves a Sign-in)

**Account**:
A User signed in on this device, with their token, as a client sees them. A browser holds at most one per User, up to a configured limit, and can switch between them without signing in again. Each is one Sign-in.
_Avoid_: Signed-in Account, device session (better-auth's term; collides with Device Login), profile, multi-session (implementation name)

**Active Account**:
The one Account the browser currently acts as. Every First-Party web app on the Shared Cookie Domain, and the Consent Screen and Device Screen, see the Active Account unless a request carries another Account's token as a bearer.
_Avoid_: current user, current session (a Sign-in, not an account)

**Account Switch**:
Making a different Account the Active Account. Happens on the Auth Worker's pages or from a First-Party web app, and takes effect in every First-Party web app on the Shared Cookie Domain at once. Signing out an Account removes it entirely; there is no "signed out but remembered" state.
_Avoid_: switch user, set active (the endpoint, not the concept)

**Login Screen**:
The Auth Worker's page at `/login`. Only ever about signing in: either plainly, or "to continue" when a Third-Party authorization brought the User here. A User who is already signed in and has nothing to continue is sent to the Home Page.
_Avoid_: sign-in page, home

**Consent Screen**:
The Auth Worker's page at `/consent`, served with the Authorization Server Role on, where the User grants or denies a Client Application its requested Scopes.
_Avoid_: consent page, authorize page

**Device Screen**:
The Auth Worker's page at `/device`, where the User enters and approves a Device Login code.
_Avoid_: device page, verification page

**Named Account**:
An Account on the device Backend, signed in by naming it (`signIn.named`), with no Auth Worker and no identity provider involved. The same email is always the same User. Switching and signing out work as they would with a real sign-in.
_Avoid_: Local Account, test account, fake user, demo user

**Name Token**:
The token `signIn.named` hands a Named Account, which carries the User it names. The device Resolver (`authz.device`) reads the User straight out of it without asking anyone, so the client and the device Backend never share state, wherever either runs. Any Name Token is accepted, and signing out revokes nothing.
_Avoid_: Local Token, fake token, test token

**Test Sign-In**:
Signing a User in by naming a `.test` email, with no Google, on a developer's own machine, so agents and tests can sign in. Exists only on the local stage; the Auth Worker refuses to start with it anywhere else.
_Avoid_: fake login, dev login, Named Account (that has no Auth Worker at all)

**Device Login**:
How a First-Party program without a browser, such as a CLI, obtains a Sign-in (`deviceCode`): it shows a code and URL, the User approves the code in a browser on the Auth Worker's device page, and the program receives its token. Always a Sign-in, never an Access Token; no Client Registration, Scopes, or consent are involved.
_Avoid_: device flow, device authorization grant (the Third-Party OAuth grant, which the toolkit does not offer), CLI auth

**Sign-in Store**:
Where a First-Party CLI keeps its Device Login token between runs: the CLI's cookie jar. Holds the token, keyed by Auth Worker; nothing in it goes stale, because the token never changes and the Auth Worker slides its expiry on use.
_Avoid_: credentials file (ties the concept to one storage), token cache (nothing is cached; it is the credential itself)

**Authorization Server Role**:
The Auth Worker's opt-in job: letting a Third-Party Client Application obtain an Access Token to act on a User's behalf, covering client registration, consent, token issuance, and token verification. Off unless a deployment configures it.
_Avoid_: OAuth provider (collides with Provider), authorization mode

**Client Application**:
A Third-Party program that holds an Access Token to act for a User: an MCP client or an approved third-party web app. A First-Party CLI is not one; it holds a Sign-in through Device Login. Nor is a First-Party Client, though it holds Access Tokens too. Whether it registered itself or was approved by hand does not change what it is.
_Avoid_: client (reserved for a First-Party program's side: the browser, the CLI), Provider, third party (some Client Applications are first-party)

**Grant**:
The standing permission a User has given one Client Application: which Scopes it may use on the User's behalf. Created when the User accepts on the Consent Screen. Revoking it on the Home Page stops the Client Application from obtaining new Access Tokens; the ones it already holds last until they expire. One Grant per Client Application per User. Grants are Third-Party only; a Sign-in is never a Grant.
_Avoid_: consent (the act of granting, not the record), connected app, authorization

**Resource Server**:
A Consumer Backend that accepts Access Tokens as well as browser Sign-ins. Every Resource Server is a Consumer Backend; not every Consumer Backend is a Resource Server. An MCP server is one kind of Resource Server.
_Avoid_: API, protected resource (the OAuth wire term; fine in protocol prose, not for the service)

**MCP Server**:
A Resource Server that speaks the Model Context Protocol over stateless Streamable HTTP and accepts only Token Principals; a browser Sign-in is never accepted there. Every MCP Server is a Resource Server; the reverse is not true.
_Avoid_: MCP endpoint (that is one route of it), tool server, MCP app

**Protected Resource Metadata**:
The discovery document a Resource Server publishes about itself: which Authorization Server issues its Access Tokens and which Scopes it understands. An MCP client reads it, after an unauthenticated challenge, to find the Auth Worker. Published by the Resource Server, never by the Auth Worker.
_Avoid_: resource metadata (ambiguous with the Auth Worker's own metadata), well-known (the path, not the concept)

**Client Registration**:
How a Client Application becomes known to the Authorization Server Role before its first authorization: registered by hand by an Administrator, self-registered at runtime (Dynamic Client Registration), or identified by a metadata document it hosts at its own URL (Client ID Metadata Document). Which one applies is a deployment decision; the resulting Client Application is the same.
_Avoid_: DCR (fine in protocol prose, not for the concept), client onboarding, app registration

**Principal**:
Who one request is from, as `Authz.Current` gives it. Always names a User; how the User was established (a Sign-in or an Access Token) is part of the Principal, never hidden from it.
_Avoid_: caller, subject

**Sign-in Principal**:
A Principal established by a Sign-in, whether it arrived as a browser cookie or a Device Login token. Carries the User and the Sign-in (`kind: 'session'`, after better-auth). Every First-Party program yields one.
_Avoid_: Session Principal, cookie user, web principal

**Token Principal**:
A Principal established by an Access Token. Carries the User, the Client Application acting for them, and the granted Scopes. Has no Sign-in.
_Avoid_: bearer (better-auth's `bearer` plugin means something else), API user

**Access Token**:
The credential the Authorization Server Role issues to a Client Application for one Resource Server, presented in the Authorization header. Short-lived; a refresh token renews it.
_Avoid_: bearer token, JWT (the format, not the concept), API key

**Scope**:
A named permission a User grants a Client Application at consent time and an Access Token carries. A Resource Server may require Scopes through an Authorization Policy; a Sign-in Principal has none.
_Avoid_: permission (reserved for what an Authorization Policy decides), role

**Consumer Backend**:
Any service (other than the Auth Worker itself) that needs to know whether an incoming request is authenticated. Talks to the Auth Worker over HTTP through `@kstackz/auth-toolkit/server` — it never touches the Primary Database directly. A Backend is one.
_Avoid_: server, app, client (reserved for the browser side)

**Cookie Cache**:
A signed, short-TTL blob better-auth writes into the session cookie itself, letting the Auth Worker (and nothing else) confirm "logged in, as whom" without a Primary Database read. Lives entirely inside the cookie — it is not a server-side cache.
_Avoid_: session cache, server cache

**Primary Database**:
The durable store holding users, linked accounts, sessions, and verification records.
_Avoid_: database, primary storage

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

**Administrator**:
A User granted the `admin` role and therefore allowed to manage users and sessions through the Auth Worker. Using the hosted dashboard does not by itself make a User an Administrator.
_Avoid_: dashboard user, admin user

**User Admission Policy**:
An optional rule that accepts or rejects an identity when it first registers, links an account, or starts a fresh provider sign-in. It does not continuously re-evaluate existing sessions; banning handles an already-admitted User.
_Avoid_: invariant, user validation

**Direct Sign-in Check**:
The browser calling the Auth Worker itself (cross-origin, not proxied) to ask "am I logged in" — used by `cookie` (`@kstackz/auth-toolkit/client/web`) to list, sign in, switch, and sign out. Requires the Auth Worker to allow the browser's origin (see Trusted Origin) and needs its cookie readable across origins (see Shared Cookie Domain).
_Avoid_: Direct Session Check (the former name), proxied check (that's the separate Server-Side Verification path)

**Server-Side Verification**:
A Consumer Backend forwarding an incoming request's cookies/headers server-to-server to the Auth Worker to validate it, getting back a Verify Payload. No CORS applies here — it's not a browser call.
_Avoid_: forwarding, proxying (proxying implies relaying the response back to the browser, which is optional here, not implied by the term)

**Verify Payload**:
What Server-Side Verification returns to a Consumer Backend: the validated session/user data plus any refreshed cookie value. Whether the Consumer Backend relays that refreshed cookie back to the browser is the Consumer Backend's own choice — the Auth Worker utility only hands it over.
_Avoid_: response (too generic)

**Current**:
The verified Principal available while handling one guarded call in a Consumer Backend: `Authz.Current`.
_Avoid_: CurrentAuth (the former name), current user (omits how the User was established), auth context (easily confused with Effect's Context)

**Resolver**:
The Service that finds out who a request is from, with a cloud version (`authz.cloud`, which performs Server-Side Verification against the Auth Worker and verifies Access Tokens) and a device version (`authz.device`, which reads a Name Token). The tag is `Authz.Resolver`; tests replace it.
_Avoid_: Current Auth Resolver, resolverLive, resolverLocal (the former names), auth provider, RPC verifier

**Unavailable**:
The Consumer Backend could not find out who called because Server-Side Verification was unavailable: `Authz.Unavailable`, a 503. Different from a call nobody signed (`Authz.Unauthenticated`).
_Avoid_: VerificationUnavailable (the former name), unauthenticated request, invalid session

**Guard**:
auth-toolkit's Middleware (see rpc-toolkit), `Authz` for Effect RPC and `AuthzHttp` for Effect HttpApi, imported by both sides from `@kstackz/auth-toolkit/guard`. Attached without a value (`Authz.guard()`) it is an Authentication Requirement; attached with one it also carries an Authorization Policy. Which value applies follows rpc-toolkit's Nearest Wins. Its server half is `authz.layer` (`authz.http`); its client half is `Authz.bearer`.
_Avoid_: Auth Cannotation (the former name), auth middleware, withAuthz and `.with` (the generic verb; Authz calls it `guard`)

**Authentication Requirement**:
A Guard without a value: the endpoint may run only for a known caller. It establishes identity but imposes no additional permission rule.
_Avoid_: auth policy (reserved for authorization)

**Authorization Policy**:
The value a Guard carries: a rule that decides whether the caller may perform the endpoint. Usually built from an invariant and a failure reason; underneath it is an Effect that fails with Forbidden.
_Avoid_: permission boolean, auth check

**Batched RPC Request**:
One HTTP request carrying multiple RPC calls. Its calls share one verification and the refreshed cookies (`authz.cookies`).
_Avoid_: parallel RPCs

**Concurrent RPC Calls**:
Independent RPC requests running at the same time. Each request verifies and carries its own caller.
_Avoid_: parallel RPCs

**Trusted Origin**:
An origin the Auth Worker's CORS config allows to make a Direct Sign-in Check against it — configurable, and must support whole-subdomain patterns (e.g. any `*.example.com` origin), not just an exact list.
_Avoid_: allowed origin, CORS origin

**Shared Cookie Domain**:
The parent domain (e.g. `.example.com`) the Auth Worker's session cookie is scoped to, so any subdomain's Direct Sign-in Check can read it. Configurable per deployment.
_Avoid_: cookie domain (kept for the config field name; this term is for the concept in prose)

The Gate, the Backends, each Account's Session and the device's Cache are the Platform Toolkit's words: see [its glossary](../platform-toolkit/CONTEXT.md).
