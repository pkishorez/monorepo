# @pkishorez/devtools

A local DevTools server for inspecting OpenTelemetry data and Laymos project
architecture.

## Usage

Start the server with `npx`:

```bash
npx @pkishorez/devtools
```

Or install it globally and run the `devtools` command:

```bash
npm i -g @pkishorez/devtools
devtools
```

The command serves its bundled home page at `http://127.0.0.1:14400`. From
there, open:

- `/lotel` to inspect local OpenTelemetry traces, logs, and flows.
- `/laymos` to explore the architecture of a local project.

The same loopback server exposes its NDJSON RPC endpoint at `/rpc`, its health
endpoint at `/health`, and its OTLP/HTTP ingestion endpoints at `/v1/traces`
and `/v1/logs`. The UI is part of this package; it does not redirect to or
depend on a hosted application.

## Get a trace

Return every stored span and correlated log for a trace from the server on the
default port:

```bash
devtools get-trace <trace-id>
```

Target a DevTools server at another URL with `--url`:

```bash
devtools get-trace <trace-id> --url http://localhost:14401
```

The command prints pretty JSON to stdout. Its `spans` and `logs` arrays contain
stored entities ordered by their OpenTelemetry times. A missing trace or
connection failure is written to stderr and exits with a nonzero status.

## Analyze a Laymos project

The `AnalyzeLaymosProject` RPC accepts `{ projectPath }`, where `projectPath`
is an absolute path or starts with `~/`. It reads `laymos.config.json` from that
folder and returns Laymos `ArchitectureAnalysis` directly. Maps and Sets use
Effect Schema's canonical JSON encoding on the wire.

Invalid paths, Config read/parse/schema/validation failures, and source
analysis failures are separate tagged RPC errors.

## Inspect a Laymos Module

The `GetLaymosModuleSource` RPC accepts `{ projectPath, modulePath }`. It runs a
fresh Architecture Analysis and returns the paths and textual contents of only
the supported source files assigned to that Configured Module.

Unknown Modules and source read failures are separate tagged RPC errors.

## Configuration

| Variable        | Default                        | Description                 |
| --------------- | ------------------------------ | --------------------------- |
| `DEVTOOLS_PORT` | `14400`                        | Port to listen on.          |
| `DEVTOOLS_DB`   | OS-specific DevTools data path | Telemetry SQLite file path. |

Use `devtools --open` to open the home page in your default browser. `--port`
and `--db` override the matching environment variables.

## Library exports

- `@pkishorez/devtools/rpc` — the RPC group definition and its tagged errors.
