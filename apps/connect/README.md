# @kestack/connect

Connects a computer to the cloud as a Machine its User reaches from anywhere: the ke-connect command, Cloud Connect on a Cloudflare Worker, and the code App Group Code talks to

## Big picture

Connect is how a computer becomes a Machine its User can reach from outside: the `ke-connect` program run on the computer, and Cloud Connect, where the Machine signs in and sends its Heartbeats. Code is one App on it; later Apps reach the same Machines. It takes over the Machine, Cloud Connect and Code's Sessions from [`@kestack/ai-toolkit`](../../toolkits/ai-toolkit/README.md), which keeps only the Coding Harnesses, as [ADR 0011](../../docs/adr/0011-ai-toolkit-stops-at-the-harness-connect-owns-the-rest.md) decides.

The package is being built in steps. So far it knows where Connect keeps its files, in the XDG folders under `kestack/` with a folder per branch in development, and which web pages may talk to it. The words are in [CONTEXT.md](CONTEXT.md).

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

No subpath is exported yet.

## Usage

Nothing is usable yet: the `ke-connect` command and the doors come in the next steps.
