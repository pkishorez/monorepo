# MCP Server

One serverless MCP Server behind the Auth Worker. It has two instances: production, deployed by GitHub Actions to Cloudflare, and local, started with `pnpm dev`. An MCP client that connects is sent to the Auth Worker to sign in and consent; only then does it see the tools. Nothing is reachable without an Access Token, and a browser Session is never accepted.

The server is one Web-standard fetch handler. Cloudflare, Node (`srvx`), and Vercel each get an entry file of a few lines around it. It keeps no state between requests (a fresh tool server per request, no session ids), so it runs the same on any serverless host.

## Ask

Ask for the production host and the Auth Worker's production host. Derive the local hosts by replacing the last label with `computer`, and show them. Suggest `/mcp` as the endpoint path and one Scope named after the server, e.g. `notes:tools`. Confirm before creating files.

The Auth Worker must already run the Authorization Server Role (see the `auth-worker` primitive). Two things change there, and both are this primitive's job to state:

1. `authorizationServer.resources` gains `https://<host>/mcp` for each instance (local auth lists the local host, production lists the production host).
2. `authorizationServer.scopes` gains the Scope with its consent-page wording, and `clientRegistration` becomes `'dynamic+cimd'` so MCP clients can register themselves.

## Placeholders

| Placeholder                | Example                 |
| -------------------------- | ----------------------- |
| `__APP_NAME__`             | `mcp`                   |
| `__APP_PATH__`             | `apps/mcp`              |
| `__STACK_NAME__`           | `KishoreMcp`            |
| `__PRODUCTION_HOST__`      | `mcp.kishore.app`       |
| `__LOCAL_HOST__`           | `mcp.kishore.computer`  |
| `__AUTH_PRODUCTION_HOST__` | `auth.kishore.app`      |
| `__AUTH_LOCAL_HOST__`      | `auth.kishore.computer` |
| `__PORTLESS_NAME__`        | `mcp.kishore`           |
| `__SCOPE__`                | `mcp:demo`              |
| `__PRODUCTION_BRANCH__`    | `main`                  |

## Files

Copy this folder to `__APP_PATH__`. Copy `.github/workflows/deploy.yml` to `.github/workflows/deploy-__APP_NAME__.yml` at the repository root. Delete this README from the copy and write the instance's own.

- `infra/config.ts`: the hosts, the endpoint path, the required Scopes, and how the rest derives.
- `infra/mcp-worker.ts`: the Cloudflare Worker. No database, no storage.
- `src/tools/`: what the server offers. `tools.ts` builds a server for one Token Principal; each tool is one file. This is the folder a new project edits.
- `src/resource-server/`: the fetch handler: discovery document, token check, stateless MCP over the tools.
- `src/entry/`: `cloudflare.ts`, `node.ts`, `vercel.ts`.
- `src/resource-server/tests/`: drives the handler with the real MCP client SDK against a minted token.

Layers (Laymos): `entry` uses `resource-server` and `infra`; `resource-server` uses `tools`. Tools never see HTTP or auth.

## Adding a tool

Create `src/tools/<name>.ts` exporting `register<Name>(server, principal?)`, call it from `tools.ts`. A tool that needs the User closes over the Token Principal. Use `inputSchema` (zod) for arguments. Add a test in `src/resource-server/tests/` by calling the tool through the client.

## Running locally

Start the local Auth Worker first, then:

```sh
pnpm dev        # Cloudflare entry under Portless: https://__LOCAL_HOST__
pnpm dev:node   # Node entry on the same host, for the portability check
```

Unauthenticated requests are refused with the pointer clients follow:

```sh
curl -si -X POST https://__LOCAL_HOST__/mcp | head -3
curl -s https://__LOCAL_HOST__/.well-known/oauth-protected-resource/mcp
```

Connect a client to `https://__LOCAL_HOST__/mcp`. MCP Inspector (`npx @modelcontextprotocol/inspector`) registers dynamically; Claude Code (`claude mcp add --transport http __APP_NAME__ https://__LOCAL_HOST__/mcp`) uses its Client ID Metadata Document. Both are sent to the Auth Worker to sign in, then `whoami` returns the User. Node CLIs trust the local HTTPS certificate only through `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem`; set it once in the shell profile.

## Deploying elsewhere

- Cloudflare: `pnpm dev` locally; the workflow deploys production.
- Node, Bun, Deno: `AUTH_URL=… MCP_RESOURCE=… node src/entry/node.ts`.
- Vercel: place `src/entry/vercel.ts` at `api/[[...path]].ts`, set `AUTH_URL` and `MCP_RESOURCE`.

The resource URL must match what the Auth Worker lists, verbatim, or every token is refused as minted for another Resource Server.

## Verify

`pnpm lint` and `pnpm test` pass. With both local instances running, an unauthenticated `POST /mcp` answers 401 with `WWW-Authenticate`, the Inspector and Claude Code reach `whoami` after signing in, and a token for another resource or without the Scope is refused.
