# @kestack/devtools

Local DevTools server for telemetry and architecture analysis, with Client
Commands for reading it back

## Big picture

Local development produces traces and logs, and a project's architecture
lives in a `laymos.config.json`. DevTools gives all of that one place.
`devtools` starts a loopback server that bundles the browser UI, a typed RPC
endpoint, and OTLP/HTTP ingestion. Every subcommand is a Client Command that
reads Traces back from a running server as JSON or text, so a shell or a
coding agent can query telemetry without a browser.

The server hosts three Tools. Lotel stores and shows OpenTelemetry data; its
telemetry contracts and store ship here as the `@kestack/devtools/lotel`
subpaths ([src/lotel](./src/lotel/README.md)). Monoverse maps a monorepo or a
single package and opens a Package's architecture in place as Embedded
Laymos, through [laymos](../laymos/README.md). Applications send telemetry
with [@kestack/effect-tracer](../effect-tracer/README.md). Kabuki lists
the running Kabuki apps connected as Kabuki Sessions and opens the Inspector
on one, through [@kestack/devtools-kabuki](../devtools-kabuki/README.md);
`/kabuki?session=<name>` opens one directly. Each Tool's views
live under `src/browser-app/ui` and are bundled into the browser UI at build time;
`pnpm cosmos` opens their fixtures.

Terms are defined in [CONTEXT.md](./CONTEXT.md) and, per Tool, in
[docs/lotel.md](./docs/lotel.md) and [docs/monoverse.md](./docs/monoverse.md). Decisions are in
[docs/adr/](./docs/adr/). The agent skill shipped with the package is in
[skills/devtools/SKILL.md](./skills/devtools/SKILL.md).

## Install

```sh
npm i -g @kestack/devtools
```

Or run it without installing: `npx @kestack/devtools`.

It has no peer dependencies.

## Exports

### `@kestack/devtools/lotel`

Node. Lotel's RPC and OTLP/HTTP layers and its SQLite Telemetry Store; see
[src/lotel](./src/lotel/README.md#kestackdevtoolslotel-1).

### `@kestack/devtools/lotel/rpc`

Browser-safe. The `LotelRpc` contract alone; see
[src/lotel](./src/lotel/README.md#kestackdevtoolslotelrpc).

### `@kestack/devtools/lotel/telemetry`

Browser-safe. Span and Log Record Schemas, Trace shapes, OTLP bodies and
errors; see [src/lotel](./src/lotel/README.md#kestackdevtoolsloteltelemetry).

### CLI

| Command                                      | What it does                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `devtools [--port] [--db] [--open]`          | Runs the DevTools Server: UI, RPC, and OTLP ingestion on `127.0.0.1:14400`. |
| `devtools list-traces [--limit 20]`          | Lists recent Trace Summaries, newest first.                                 |
| `devtools get-trace <trace-id>`              | Returns one Trace: spans in start order with their Log Records.             |
| `devtools kabuki sessions`                   | Lists the live Kabuki Sessions: name, app, origin, page.                    |
| `devtools kabuki history <session>`          | A Kabuki Session's History, one line per entry; `--last N`, `--since <id>`. |
| `devtools kabuki changes <session> <step>`   | What one Step did to each Instance.                                         |
| `devtools kabuki snapshot <session>`         | The Snapshot at a Step or a part of it; `--at`, `--path`, `--expand`.       |
| `devtools skills [<name>] [--install <dir>]` | Lists, prints, or installs the shipped agent skill.                         |

Client Commands take `--url` and `--format json|text`. The server URL comes
from `--url`, then `DEVTOOLS_URL`, then `DEVTOOLS_PORT` on `127.0.0.1`, then
`http://127.0.0.1:14400`. The server reads `DEVTOOLS_PORT` and `DEVTOOLS_DB`
when the flags are absent.

## Usage

### Start the server and send telemetry to it

Run the server, then point an application's telemetry layer at it. Traces
and logs from every process land in one SQLite file.

```sh
devtools --open
# devtools running on http://127.0.0.1:14400
```

```ts
import { Effect, ManagedRuntime } from 'effect';
import { makeDevTelemetryLayer } from '@kestack/effect-tracer/telemetry/dev-telemetry';

// One runtime per process; each names its own service.
const server = ManagedRuntime.make(
  makeDevTelemetryLayer({
    endpoint: 'http://127.0.0.1:14400',
    serviceName: 'server:api-1',
  }),
);

await server.runPromise(
  Effect.log('order accepted').pipe(Effect.withSpan('handle-order')),
);

// Disposing drains the last batch.
await server.dispose();
```

How it works:

- The server listens on loopback only and serves `/`, `/lotel`,
  `/monoverse`, `/kabuki`, `/rpc`, `/health`, `/story-evidence`, `/v1/traces`, and
  `/v1/logs`. `/story-evidence?project=&proof=&file=` serves one file from a
  Proof's `.laymos/stories/<proof id>/` Evidence folder and nothing outside it.
- Kabuki apps dial the WebSocket `/kabuki/connect` as Kabuki Sessions, from
  any origin. `/kabuki/sessions` and `/kabuki/session/:name` list them and
  forward one's Kabuki Session Api, and answer only a request with no
  `Origin` or DevTools' own
  ([@kestack/devtools-kabuki](../devtools-kabuki/README.md)).
- `makeDevTelemetryLayer` posts OTLP/HTTP JSON to `/v1/traces` and `/v1/logs`.

### Read telemetry back from a shell

Client Commands query the running server. JSON is the default so output can be
piped; `--format text` renders a Trace as its Narrative.

```sh
devtools list-traces --limit 5
devtools get-trace 4bf92f3577b34da6a3ce929d0e0e4736 --format text

# A Kabuki app opened with ?kabuki-session=checkout.
devtools kabuki history checkout --last 10 --format text
devtools kabuki snapshot checkout --path model.cart --format text

# Install the agent skill so a coding agent knows these commands.
devtools skills devtools --install .claude/skills
```

How it works:

- Each command opens an Effect RPC client over NDJSON against `DevtoolsRpc`
  at `<url>/rpc`; the `kabuki` commands dial `<url>/kabuki/sessions` and
  `<url>/kabuki/session/<name>` over WebSockets instead.
- A missing Trace or Kabuki Session, or an unreachable server, is written to stderr
  with a nonzero exit.
- Laymos is not covered by Client Commands; use the `laymos` CLI.
