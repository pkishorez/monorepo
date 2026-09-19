# Plan: an MCP Server behind the Auth Worker

Outcome: a serverless MCP Server that refuses every request without a valid
Access Token, that MCP clients reach only after logging in at the Auth Worker,
and whose shape is the template for every future MCP Server. The acceptance
test runs entirely on this machine: local Auth Worker, local MCP Server, real
MCP clients.

Vocabulary follows `toolkits/auth-toolkit/CONTEXT.md`. Three terms were added
for this work: MCP Server, Protected Resource Metadata, Client Registration.

## Decisions (settled in the grilling session)

| #   | Decision                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reusable glue lives in auth-toolkit as a new `auth-toolkit/server/mcp` subpath. No separate MCP toolkit.                                                                                                                                                                  |
| 2   | The template is a new skill primitive `.claude/skills/auth-toolkit/primitives/mcp-server`. The deployed instance is `mine/apps/mcp`, a scaffolded copy kept identical.                                                                                                    |
| 3   | Client Registration on the Authorization Server Role becomes `clientRegistration: 'manual' \| 'dynamic' \| 'cimd' \| 'dynamic+cimd'`, default `manual`. `mine/packages/auth` uses `'dynamic+cimd'`.                                                                       |
| 4   | CIMD ships now with a Workers transport that is plain `fetch` with `redirect: 'manual'`; Workers cannot reach private addresses, so no DNS checks. Recorded in an ADR.                                                                                                    |
| 5   | Resource identifiers: `https://mcp.kishore.computer/mcp` (local), `https://mcp.kishore.app/mcp` (prod). No localhost resource.                                                                                                                                            |
| 6   | The MCP Server is a plain `(Request) => Promise<Response>` handler in plain TypeScript, no Effect. One entry file per platform: Cloudflare (Alchemy), Node (`srvx`), Vercel.                                                                                              |
| 7   | Stateless Streamable HTTP with the SDK's per-request legacy fallback (`legacy: 'stateless'`), since every current client, including the v2 client SDK, still opens with the 2025 protocol. GET/DELETE session calls answer 405. SDK is `@modelcontextprotocol/server` v2. |
| 8   | Token verification builds on `createMcpProtectedRequestHandler` from `@better-auth/mcp`, mapped to a Token Principal. Protected Resource Metadata is served by the toolkit glue.                                                                                          |
| 9   | Access Tokens only. A browser Session is never accepted at the MCP Server.                                                                                                                                                                                                |
| 10  | One Scope, `mcp:demo`. Two tools: `whoami` (returns the Token Principal) and `echo`.                                                                                                                                                                                      |
| 11  | Acceptance: Alchemy dev path under Portless. Node entry smoke-tested once. Vercel entry file only, not deployed.                                                                                                                                                          |
| 12  | Clients: `curl` (401 + challenge), MCP Inspector (Dynamic Client Registration), Claude Code (CIMD).                                                                                                                                                                       |
| 13  | `mine` changes land as one branch: uncommitted auth role enablement, registration flag, resource and scope, `apps/mcp`, `KishoreMcp` stack, `deploy-mcp.yml`. Local is the acceptance test; prod deploys on merge.                                                        |
| 14  | Fix the two stale spots on this branch first: `tsconfig.json` path mappings and `appName` in `auth.generate.ts`.                                                                                                                                                          |

Already done: `NODE_EXTRA_CA_CERTS` points at the Portless CA in `~/.dotfiles/zshenv`, and Portless install is part of `scripts/setup_node.zsh`. Bare Node CLIs now trust `*.computer`.

## Phase 0: housekeeping on `feat/auth-authorization-server`

1. Update `toolkits/auth-toolkit/tsconfig.json` path mappings to the post-refactor locations under `src/server/effect/` and `src/server/verification/`.
2. Replace `appName` with `branding` in `auth.generate.ts`.
3. Run `pnpm --filter auth-toolkit lint` and the test suite.

## Phase 1: auth-toolkit, Authorization Server Role

Files: `src/worker/auth-model.ts`, `src/worker/tests/authorization-server.test.ts`, new `src/worker/cimd-transport.ts`.

1. Extend `AuthorizationServerConfig` with `clientRegistration`. Map:
   - `dynamic` and `dynamic+cimd` set `allowDynamicClientRegistration: true` and `allowUnauthenticatedClientRegistration: true` on `oauthProvider`.
   - `cimd` and `dynamic+cimd` add the `cimd()` plugin with `metadataProfile: 'mcp-2026-07-28'` and the Workers transport.
2. Write the Workers CIMD transport: HTTPS only, GET/HEAD only, resolve A and AAAA with `node:dns/promises`, reject any non-public address via `isPublicRoutableHost` from `@better-auth/core/utils/host`, then `fetch` with `redirect: 'manual'`. Unit test it with a stubbed resolver.
3. Tests: metadata advertises `registration_endpoint` only for the dynamic variants; `/oauth2/register` accepts an unauthenticated MCP-style registration; CIMD rejects a private-address client id.
4. ADR 0009: "MCP clients register themselves; the CIMD transport cannot pin connections on Workers." Context, the DCR deprecation timeline, the trade-off, consequences.

## Phase 2: auth-toolkit, `server/mcp` subpath

New module `src/server/mcp/` with a narrow `index.ts`, following the deep-module and Laymos conventions. Register the subpath in `package.json` exports, `tsconfig.json` paths, and `laymos.config.json`.

Public surface:

```ts
createMcpResourceServer({
  authWorkerUrl: string;        // e.g. https://auth.kishore.computer
  resource: string;             // e.g. https://mcp.kishore.computer/mcp
  requiredScopes?: string[];
  handler: (request: Request, principal: TokenPrincipal) => Promise<Response>;
}): (request: Request) => Promise<Response>
```

Behaviour:

1. `GET /.well-known/oauth-protected-resource` and the path-suffixed variant return Protected Resource Metadata: `resource`, `authorization_servers: [issuer]`, `bearer_methods_supported: ['header']`, `scopes_supported`.
2. Every other request goes through `createMcpProtectedRequestHandler` with `issuer = ${authWorkerUrl}/api/auth`, `audience = resource`, `jwksUrl = ${issuer}/jwks`. Unauthenticated requests get a JSON-RPC 401 with the RFC 9728 `WWW-Authenticate` challenge. Missing scopes get 403 `insufficient_scope`.
3. Verified claims map to the existing `TokenPrincipal` shape (`user`, `clientId`, `scopes`) and are handed to `handler`. Cookies are ignored entirely.
4. Tests: metadata document shape; 401 challenge names the metadata URL; a token minted by the in-memory Auth Worker for the right audience is accepted; wrong audience is rejected; missing scope yields 403.

## Phase 3: the `mcp-server` primitive (template)

`.claude/skills/auth-toolkit/primitives/mcp-server/`:

```
package.json          scripts: dev (portless run --force alchemy dev), dev:node, build, lint, test
portless.json         { "name": "__NAME__.kishore" }
alchemy.run.ts        Cloudflare.Worker, stages local + prod, no database, nodejs_compat
tsconfig.json
README.md             what it is, how to run, how to add a tool, how to deploy elsewhere
src/mcp/server.ts     McpServer with tools; the only file a new project edits
src/mcp/index.ts      door
src/handler.ts        createMcpResourceServer + createMcpHandler({ legacy: 'reject' })
src/entry.cloudflare.ts   export default { fetch }
src/entry.node.ts         srvx serve on PORT
src/entry.vercel.ts       export const POST / GET
src/handler.test.ts
.github/workflows/deploy.yml
```

Tools: `whoami` returns the Token Principal's user id, email, name, client id, scopes. `echo` returns its input.

Update `SKILL.md` with the primitive and the recipe: register the resource and scope on the Auth Worker, scaffold, run, connect.

## Phase 4: `mine` branch

1. Commit the pending auth role enablement in `packages/auth`.
2. `packages/auth/src/worker.ts`: `clientRegistration: 'dynamic+cimd'`, `resources` includes the stage's MCP resource, `scopes` includes `mcp:demo`. The resource URL comes from Alchemy env (`MCP_RESOURCE`) so local and prod differ without code.
3. Scaffold `apps/mcp` from the primitive with name `mcp`. Stack `KishoreMcp`, domain `mcp.kishore.app` in prod, `dev.port` from Portless locally, `AUTH_URL` and `MCP_RESOURCE` per stage.
4. `.github/workflows/deploy-mcp.yml` copied from `deploy-auth.yml`.
5. Add the MCP row to `docs/local-dev-portless.md` and the Portless CA note as machine setup.
6. Catalog entries in `pnpm-workspace.yaml` for `@modelcontextprotocol/server` and `srvx`.

## Phase 5: acceptance, all local

Two terminals: `pnpm --filter @monorepo/auth dev`, `pnpm --filter @monorepo/mcp dev`.

1. `curl -i -X POST https://mcp.kishore.computer/mcp` returns 401 with `WWW-Authenticate: Bearer resource_metadata="https://mcp.kishore.computer/.well-known/oauth-protected-resource"`.
2. `curl https://mcp.kishore.computer/.well-known/oauth-protected-resource` names `https://auth.kishore.computer/api/auth`.
3. MCP Inspector: connect to the `/mcp` URL, complete Google login and consent at `auth.kishore.computer`, call `whoami`, see your user. This exercises Dynamic Client Registration.
4. Claude Code: `claude mcp add --transport http mcp-local https://mcp.kishore.computer/mcp`, authenticate, call `whoami`. This exercises CIMD.
5. Node entry: `pnpm --filter @monorepo/mcp dev:node`, repeat step 1 and the Inspector connection once.
6. Negative: a token minted for another resource, or a token missing `mcp:demo`, is rejected with the expected status.

## Out of scope

- Deploying to Vercel. The entry file exists and is documented.
- DPoP. Not enforced anywhere in the toolkit yet.
- Introspection or early revocation. ADR 0007 stands.
- A per-resource scope allowlist on the Authorization Server Role.

## Outcome (2026-09-19)

Built and verified locally: toolkit lint and 72 tests, `apps/mcp` lint, Laymos and 5 client-driven tests, both entries live under Portless, discovery at both RFC 8414 paths, 401 challenge, Inspector-shaped dynamic registration, Claude Code registered from its Client ID Metadata Document inside workerd. Two provider limits found: registrations without `application_type` default to web (handled in the Auth Worker as native for loopback-only redirects), and `localhost:<port>` callbacks are matched exactly while `127.0.0.1:<port>` is port-agnostic (Claude Code defaults to `localhost`; set its fixed loopback port option so it uses `127.0.0.1`, or wait for an upstream fix). Google sign-in itself remains the one manual step.

## Risks

- `@modelcontextprotocol/server` 2.0.0 was published 2026-09-17. pnpm's 24-hour release age clears around 2026-09-18 12:00 UTC. If install fails, wait rather than drop the age policy.
- CIMD on Workers depends on `node:dns` `resolve4`/`resolve6` behaving under `alchemy dev`. If Miniflare lacks them, fall back to a `fetch`-only transport locally and keep the resolving transport for prod, and say so in the ADR.
- The Inspector's redirect URI is a loopback `http://localhost:<port>` URL. The provider must accept loopback redirects for dynamically registered clients. Verify in Phase 1 tests.
