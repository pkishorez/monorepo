# @kestack/connect

Connects a computer to the cloud as a Machine its User reaches from anywhere: the ke-connect command, Cloud Connect on a Cloudflare Worker, and the code App Group Code talks to

## Big picture

Connect is how a computer becomes a Machine its User can reach from outside: the `ke-connect` program run on the computer, and Cloud Connect, where the Machine signs in and sends its Heartbeats. Code is one App on it; later Apps reach the same Machines. It takes over the Machine, Cloud Connect and Code's Sessions from [`@kestack/ai-toolkit`](../../toolkits/ai-toolkit/README.md), which keeps only the Coding Harnesses, as [ADR 0011](../../docs/adr/0011-ai-toolkit-stops-at-the-harness-connect-owns-the-rest.md) decides.

The package is being built in steps. So far it holds the Machine, Cloud Connect and the `ke-connect` command; Connect keeps its files in the XDG folders under `kestack/`, with a folder per branch in development, moved there once from `~/.ai-toolkit`. The `code` App Group is still served from ai-toolkit. The words are in [CONTEXT.md](CONTEXT.md).

## Install

```sh
pnpm add @kestack/connect effect @kestack/kabuki @kestack/std-toolkit @kestack/rpc-toolkit @kestack/auth-toolkit @tanstack/db
```

- `effect`: everything Connect exposes is an Effect value.
- `@kestack/kabuki`: the Machine and the `code` App Group run as Actors.
- `@kestack/std-toolkit`: the stored records and the Replica an App reads them through.
- `@kestack/rpc-toolkit`: the WebSocket an App reaches a Machine over.
- `@kestack/auth-toolkit`: a Machine signs in to Cloud Connect as its User.
- `@tanstack/db`: the collections the Replica fills.

Node 24 or newer is required.

## Exports

### `./code`

| Export             | What it does                                                                  |
| ------------------ | ----------------------------------------------------------------------------- |
| `CloudApi`         | Cloud Connect's RPC: a Machine reports itself; an App lists and forgets them. |
| `CloudClient`      | The Service that calls Cloud Connect at a URL, signed by the App's Accounts.  |
| `Machine`          | Schema of a Machine as its User sees it, with its Last Seen.                  |
| `MachineReport`    | Schema of what a Machine reports on each Heartbeat.                           |
| `MachineStatus`    | Schema of where a Machine's tunnel stands.                                    |
| `TunnelCheck`      | Schema of whether a Machine could reach itself at its public address.         |
| `MachineForgotten` | Error: the Machine was forgotten by its User.                                 |
| `MachineTaken`     | Error: the Machine id belongs to another User.                                |
| `addressOf`        | The address a Machine Status is up at, or null.                               |
| `RPC_PATH`         | Cloud Connect's RPC path.                                                     |
| `AUTH_PATH`        | The path that answers how a Machine signs in.                                 |

### `./worker`

| Export          | What it does                                                         |
| --------------- | -------------------------------------------------------------------- |
| `serve`         | Cloud Connect on a Worker's D1 database, as a fetch handler.         |
| `serveOver`     | The same over any SQLite driver and Guard, for tests.                |
| `machinesTable` | The std Table Cloud Connect keeps Machines in, for setup and deploy. |

### `./node`

| Export   | What it does                                                              |
| -------- | ------------------------------------------------------------------------- |
| `serve`  | Runs Connect as a Machine until stopped: signed in, serving, tunnelled.   |
| `logout` | Signs out of Cloud Connect and forgets the Machine, keeping its Sessions. |

### `./dev`

| Export          | What it does                                                              |
| --------------- | ------------------------------------------------------------------------- |
| `runConnectDev` | Runs this branch's Cloud Connect under `alchemy dev` and a Machine on it. |
| `branchOf`      | The branch a checkout is, and its Cloud Connect, as Portless names them.  |

## Usage

### Serve a Machine

Run `npx @kestack/connect serve` on a computer, sign in as you do in Code, and it is listed as one of your Machines in a few seconds. `ke-connect serve --help` lists the flags; `ke-connect logout` forgets the Machine. In this monorepo, `pnpm -F @kestack/connect dev` runs the branch's own Cloud Connect and Machine.
