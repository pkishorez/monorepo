# Auth Toolkit

Curated building blocks over better-auth for standing up one shared Auth Worker and letting any number of consumer backends and frontends verify sessions against it, without wiring better-auth's internals themselves.

## Language

**Auth Worker**:
The single deployed better-auth instance (Cloudflare Worker) that owns the Primary Database and Session Store, and is the source of truth for sign-in, sign-out, and session validation. Built by a consumer composing a Primary Database Provider and a Session Store Provider into `createAuthWorker`; not deployed by this package itself.
_Avoid_: auth server (ambiguous with any backend that merely talks to it), backend

**Consumer Backend**:
Any service (other than the Auth Worker itself) that needs to know whether an incoming request is authenticated. Talks to the Auth Worker over HTTP via the server subpath's client — it never touches the Primary Database or Session Store directly.
_Avoid_: server, app, client (reserved for the browser side)

**Cookie Cache**:
A signed, short-TTL blob better-auth writes into the session cookie itself, letting the Auth Worker (and nothing else) confirm "logged in, as whom" without a Session Store read. Lives entirely inside the cookie — it is not a server-side cache.
_Avoid_: session cache, server cache

**Session Store**:
The secondaryStorage backend (Cloudflare KV) holding live session records (session token → user id, expiry). Consulted only when the Cookie Cache is missing or expired; refreshes the Cookie Cache on a hit.
_Avoid_: secondary storage (kept as the better-auth config name, but "Session Store" is the term for what it holds), secondary cache

**Primary Database**:
The durable store holding user, account, and session records — a decision with several Providers (D1 in production; an in-memory Provider for tests; a future SQL dialect like Postgres, or a Cloudflare Durable Object, would be a sibling Provider group).
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
One of the interchangeable backends for a Primary Database or Session Store decision (e.g. D1 vs. an in-memory Provider for tests, both in the SQLite Dialect Group). Providers are peers — a consumer picks exactly one and passes its built value into `createAuthWorker`; the worker never knows or cares which Provider backed it.
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
The verified User and Session available while handling one authenticated request in a Consumer Backend.
_Avoid_: current user (omits the Session), auth context (easily confused with Effect's Context)

**Current Auth Resolver**:
The replaceable server capability that resolves Current Auth and refreshed cookies from an incoming request. Its production implementation performs Server-Side Verification against the Auth Worker.
_Avoid_: auth provider, RPC verifier

**Authentication Requirement**:
A declaration that an RPC may run only with valid Current Auth. It establishes identity but imposes no additional permission rule.
_Avoid_: auth policy (reserved for authorization)

**Authorization Policy**:
An Effect-returning rule that decides whether Current Auth may perform an RPC. A declaration on a more specific RPC replaces an inherited group declaration.
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
