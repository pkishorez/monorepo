# Auth Toolkit

Curated building blocks over better-auth for standing up one shared Auth Worker and letting any number of consumer backends and frontends verify sessions against it, without wiring better-auth's internals themselves.

## Language

**Auth Worker**:
The shared authentication service that owns the Primary Database and is the source of truth for sign-in, sign-out, and session validation. Always plays the Identity Role and serves the Home Page, the Login Screen, and the Device Screen; optionally also the Authorization Server Role, in which case it also serves the Consent Screen.
_Avoid_: auth server (ambiguous with any backend that merely talks to it), backend

**First-Party**:
A program the deployment owns, in which the User signs in to the product itself: a web app or a CLI. Served by the Identity Role alone; its credential is a Session and there is nothing to register or consent to.
_Avoid_: internal app, our client

**Third-Party**:
A program the deployment does not own that wants to act as the User against a Resource Server, such as an MCP client. Served by the Authorization Server Role; it is a Client Application, the User consents to Scopes, and its credential is an Access Token. The First-Party/Third-Party split, not web/CLI/MCP, decides which role and which credential apply.
_Avoid_: external app, integration

**Identity Role**:
The Auth Worker's always-on job: signing Users in and answering "who is this" for a Session, whether it arrives as a browser cookie or a Device Login token. Every deployment has it.
_Avoid_: identity provider, IdP (implies a federation protocol the toolkit does not expose)

**Home Page**:
The Auth Worker's page at `/`. Shows the signed-in User who they are, their Sessions, and their Grants, and lets them revoke any of them. A signed-out visitor is sent to the Login Screen; there is nothing to see.
_Avoid_: dashboard (collides with better-auth's hosted dashboard), account page

**Login Screen**:
The Auth Worker's page at `/login`. Only ever about signing in: either plainly, or "to continue" when a Third-Party authorization brought the User here. A User who is already signed in and has nothing to continue is sent to the Home Page.
_Avoid_: sign-in page, home

**Consent Screen**:
The Auth Worker's page at `/consent`, served with the Authorization Server Role on, where the User grants or denies a Client Application its requested Scopes.
_Avoid_: consent page, authorize page

**Device Screen**:
The Auth Worker's page at `/device`, where the User enters and approves a Device Login code.
_Avoid_: device page, verification page

**Device Login**:
How a First-Party program without a browser, such as a CLI, obtains a Session: it shows a code and URL, the User approves the code in a browser on the Auth Worker's device page, and the program receives a Session token. Always a Session, never an Access Token; no Client Registration, Scopes, or consent are involved.
_Avoid_: device flow, device authorization grant (the Third-Party OAuth grant, which the toolkit does not offer), CLI auth

**Session Store**:
Where a First-Party CLI keeps its Device Login Session token between runs: the CLI's cookie jar. Holds the token and the User it belongs to, keyed by Auth Worker; nothing in it goes stale, because the token never changes and the Auth Worker slides its expiry on use.
_Avoid_: credentials file (ties the concept to one storage), token cache (nothing is cached; it is the credential itself)

**Authorization Server Role**:
The Auth Worker's opt-in job: letting a Third-Party Client Application obtain an Access Token to act on a User's behalf, covering client registration, consent, token issuance, and token verification. Off unless a deployment configures it.
_Avoid_: OAuth provider (collides with Provider), authorization mode

**Client Application**:
A Third-Party program that holds an Access Token to act for a User: an MCP client or an approved third-party web app. A First-Party CLI is not one; it holds a Session through Device Login. Whether it registered itself or was approved by hand does not change what it is.
_Avoid_: client (reserved for the browser side), Provider, third party (some Client Applications are first-party)

**Grant**:
The standing permission a User has given one Client Application: which Scopes it may use on the User's behalf. Created when the User accepts on the Consent Screen. Revoking it on the Home Page stops the Client Application from obtaining new Access Tokens; the ones it already holds last until they expire. One Grant per Client Application per User. Grants are Third-Party only; a Session is never a Grant.
_Avoid_: consent (the act of granting, not the record), connected app, authorization

**Resource Server**:
A Consumer Backend that accepts Access Tokens as well as browser Sessions. Every Resource Server is a Consumer Backend; not every Consumer Backend is a Resource Server. An MCP server is one kind of Resource Server.
_Avoid_: API, protected resource (the OAuth wire term; fine in protocol prose, not for the service)

**MCP Server**:
A Resource Server that speaks the Model Context Protocol over stateless Streamable HTTP and accepts only Token Principals; a browser Session is never accepted there. Every MCP Server is a Resource Server; the reverse is not true.
_Avoid_: MCP endpoint (that is one route of it), tool server, MCP app

**Protected Resource Metadata**:
The discovery document a Resource Server publishes about itself: which Authorization Server issues its Access Tokens and which Scopes it understands. An MCP client reads it, after an unauthenticated challenge, to find the Auth Worker. Published by the Resource Server, never by the Auth Worker.
_Avoid_: resource metadata (ambiguous with the Auth Worker's own metadata), well-known (the path, not the concept)

**Client Registration**:
How a Client Application becomes known to the Authorization Server Role before its first authorization: registered by hand by an Administrator, self-registered at runtime (Dynamic Client Registration), or identified by a metadata document it hosts at its own URL (Client ID Metadata Document). Which one applies is a deployment decision; the resulting Client Application is the same.
_Avoid_: DCR (fine in protocol prose, not for the concept), client onboarding, app registration

**Principal**:
Whoever Current Auth represents for one request. Always names a User; how the User was established (a Session or an Access Token) is part of the Principal, never hidden from it.
_Avoid_: caller, subject

**Session Principal**:
A Principal established by a Session, whether it arrived as a browser cookie or a Device Login token. Carries the User and the Session. Every First-Party program yields one.
_Avoid_: cookie user, web principal

**Token Principal**:
A Principal established by an Access Token. Carries the User, the Client Application acting for them, and the granted Scopes. Has no Session.
_Avoid_: bearer (better-auth's `bearer` plugin means something else), API user

**Access Token**:
The credential the Authorization Server Role issues to a Client Application for one Resource Server, presented in the Authorization header. Short-lived; a refresh token renews it.
_Avoid_: bearer token, JWT (the format, not the concept), API key

**Scope**:
A named permission a User grants a Client Application at consent time and an Access Token carries. A Resource Server may require Scopes through an Authorization Policy; a Session Principal has none.
_Avoid_: permission (reserved for what an Authorization Policy decides), role

**Consumer Backend**:
Any service (other than the Auth Worker itself) that needs to know whether an incoming request is authenticated. Talks to the Auth Worker over HTTP via the server subpath's client — it never touches the Primary Database directly.
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

**Direct Session Check**:
The browser calling the Auth Worker itself (cross-origin, not proxied) to ask "am I logged in" — used by the client subpath's hooks for `useSession`, sign-in, and sign-out. Requires the Auth Worker to allow the browser's origin (see Trusted Origin) and needs its cookie readable across origins (see Shared Cookie Domain).
_Avoid_: proxied check (that's the separate Server-Side Verification path)

**Server-Side Verification**:
A Consumer Backend forwarding an incoming request's cookies/headers server-to-server to the Auth Worker to validate it, getting back a Verify Payload. No CORS applies here — it's not a browser call.
_Avoid_: forwarding, proxying (proxying implies relaying the response back to the browser, which is optional here, not implied by the term)

**Verify Payload**:
What Server-Side Verification returns to a Consumer Backend: the validated session/user data plus any refreshed cookie value. Whether the Consumer Backend relays that refreshed cookie back to the browser is the Consumer Backend's own choice — the Auth Worker utility only hands it over.
_Avoid_: response (too generic)

**Current Auth**:
The verified Principal available while handling one authenticated request in a Consumer Backend.
_Avoid_: current user (omits how the User was established), auth context (easily confused with Effect's Context)

**Current Auth Resolver**:
The replaceable server capability that resolves Current Auth and refreshed cookies from an incoming request. Its production implementation performs Server-Side Verification against the Auth Worker.
_Avoid_: auth provider, RPC verifier, CurrentAuthResolver (the tag is `Authz.Resolver`; its production layer is `resolverLive`)

**Authentication Verification Failure**:
The Consumer Backend could not determine Current Auth because Server-Side Verification was unavailable. This is different from a request that has no valid session.
_Avoid_: unauthenticated request, invalid session

**Auth Cannotation**:
The one Cannotation (see rpc-toolkit) auth-toolkit declares per Sibling. Attached without a value it is an Authentication Requirement; attached with a value it also carries an Authorization Policy. Which value applies to an endpoint follows rpc-toolkit's Nearest Wins.
_Avoid_: auth middleware (the Cannotation attaches one), withAuthz and `.with` (the generic Cannotation verb; Authz calls it `guard`)

**Authentication Requirement**:
An Auth Cannotation without a value: the endpoint may run only with valid Current Auth. It establishes identity but imposes no additional permission rule.
_Avoid_: auth policy (reserved for authorization)

**Authorization Policy**:
The value an Auth Cannotation carries: a rule that decides whether Current Auth may perform the endpoint. Usually built from an invariant and a failure reason; underneath it is an Effect that fails with Forbidden.
_Avoid_: permission boolean, auth check

**Batched RPC Request**:
One HTTP request carrying multiple RPC calls. Its calls share request-scoped session verification and refreshed cookies.
_Avoid_: parallel RPCs

**Concurrent RPC Calls**:
Independent RPC requests running at the same time. Each request verifies and carries its own Current Auth.
_Avoid_: parallel RPCs

**Trusted Origin**:
An origin the Auth Worker's CORS config allows to make a Direct Session Check against it — configurable, and must support whole-subdomain patterns (e.g. any `*.example.com` origin), not just an exact list.
_Avoid_: allowed origin, CORS origin

**Shared Cookie Domain**:
The parent domain (e.g. `.example.com`) the Auth Worker's session cookie is scoped to, so any subdomain's Direct Session Check can read it. Configurable per deployment.
_Avoid_: cookie domain (kept for the config field name; this term is for the concept in prose)
