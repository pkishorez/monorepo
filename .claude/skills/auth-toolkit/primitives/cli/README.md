# CLI

One first-party CLI and the serverless server it calls, both behind the Auth Worker. The server has two instances: production, deployed by GitHub Actions to Cloudflare, and local, started with `pnpm dev`. The CLI signs in through the browser with Device Login, keeps the Session in a file, and sends it with every RPC. The server is a normal Consumer Backend: its RPC group is guarded with `Authz.guard()`, and a Device Login token is a Session, accepted exactly like a browser cookie with no opt-in. No Authorization Server Role, no Scopes, no client registration are involved.

The server is one Web-standard fetch handler. Cloudflare and Node (`srvx`) each get an entry file of a few lines around it. It keeps no state between requests, so it runs the same on any serverless host.

## Ask

Ask for the production host, the Auth Worker's production host, and the name the CLI signs in as (the app name the device page shows and the Session Store directory). Derive the local hosts by replacing the last label with `computer`, and show them. Suggest `/rpc/greeting` as the RPC path. Confirm before creating files.

The Auth Worker needs nothing new. Device Login is part of the Identity Role, and the pages the browser walks through (enter the code, confirm, done) ship inside auth-toolkit. The only thing to check is that the Auth Worker's trusted origins are not in the way: the CLI never uses a browser origin, so nothing to add.

## Placeholders

| Placeholder                | Example                 |
| -------------------------- | ----------------------- |
| `__APP_NAME__`             | `cli`                   |
| `__APP_PATH__`             | `apps/cli`              |
| `__STACK_NAME__`           | `KishoreCli`            |
| `__PRODUCTION_HOST__`      | `cli.kishore.app`       |
| `__LOCAL_HOST__`           | `cli.kishore.computer`  |
| `__AUTH_PRODUCTION_HOST__` | `auth.kishore.app`      |
| `__AUTH_LOCAL_HOST__`      | `auth.kishore.computer` |
| `__PORTLESS_NAME__`        | `cli.kishore`           |
| `__CLI_NAME__`             | `kishore`               |
| `__PRODUCTION_BRANCH__`    | `main`                  |

`__CLI_NAME__` is the descriptive client ID shown on the device page and names the Session Store file, `$XDG_STATE_HOME/__CLI_NAME__/auth.json` (`~/.local/state/__CLI_NAME__/auth.json` by default).

## Files

Copy this folder to `__APP_PATH__`. Copy `.github/workflows/deploy.yml` to `.github/workflows/deploy-__APP_NAME__.yml` at the repository root. Delete this README from the copy and write the instance's own.

- `infra/config.ts`: the hosts, the RPC path, the CLI name, and how the rest derives.
- `infra/api-worker.ts`: the Cloudflare Worker. No database, no storage.
- `src/shared/rpc/greeting/`: the RPC contract the CLI and the server agree on, with `Authz.guard()` on the group. Browser-safe.
- `src/server/handlers/`: what the server does. Each handler reads Current Auth and knows nothing about HTTP. This is the folder a new project edits.
- `src/server/rpc-host/`: the fetch handler: Server-Side Verification against the Auth Worker, the guarded group over HTTP, and `/` describing it.
- `src/cli/`: `client.ts` builds an RPC client layer that carries the Session (`CliAuth.rpcSession`); `main.ts` is the commands, an Effect program run with `NodeRuntime.runMain` over `CliAuth.layer`.
- `src/entry/`: `cloudflare.ts`, `node.ts`.
- `src/server/tests/`: drives the server through the real CLI client with a stand-in resolver.

Layers (Laymos): `entry` uses `server` and `infra`; `server` uses `shared`; `cli` uses `shared` and `infra`. The server and the CLI share only the contract.

## Adding a command

Add the RPC to `src/shared/rpc/greeting/greeting.ts`, implement it in `src/server/handlers/handlers.ts` (read `Authz.CurrentAuth` for the User), and add a `case` in `src/cli/main.ts` that goes through `call`. Add a test in `src/server/tests/` by calling the RPC through `runtimeFor`.

## Running locally

Start the local Auth Worker first, then:

```sh
pnpm dev        # Cloudflare entry under Portless: https://__LOCAL_HOST__
pnpm dev:node   # Node entry on the same host, for the portability check
```

The CLI is a Node process, so it trusts the local HTTPS certificate only through `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem`; set it once in the shell profile.

```sh
pnpm cli login          # opens the browser, prints the code and the URL
pnpm cli whoami
pnpm cli hello Ada
pnpm cli logout
```

`pnpm cli login` prints the code and the device page URL, opens the browser when run in a terminal, and stores the Session in `$XDG_STATE_HOME/__CLI_NAME__/auth.json` (`~/.local/state/__CLI_NAME__/auth.json` by default) once the User approves. `pnpm cli logout` signs out at the Auth Worker and deletes the file. `STAGE=prod` points the CLI at the production instance.

The token never changes. The Auth Worker slides its expiry on use (seven days idle by default), so a CLI used regularly stays signed in. A dead token, expired or revoked, makes the CLI say to log in again.

## Deploying elsewhere

- Cloudflare: `pnpm dev` locally; the workflow deploys production.
- Node, Bun, Deno: `AUTH_URL=… node src/entry/node.ts`.

The server only needs to reach the Auth Worker; the CLI needs the server's host and the Auth Worker's host, both in `infra/config.ts`.

## Verify

`pnpm lint` and `pnpm test` pass. With both local instances running, `pnpm cli whoami` before login says to log in, `pnpm cli login` finishes in the browser and prints the User, `pnpm cli whoami` and `pnpm cli hello` answer, and after `pnpm cli logout` the next call says to log in again.
