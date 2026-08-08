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

The server listens on `http://127.0.0.1:14400`. Its NDJSON RPC endpoint is
available at `/rpc`, and its OTLP/HTTP ingestion endpoints are available at
`/v1/traces`, `/v1/logs`, and `/v1/metrics`.

## Get a trace

Return every stored span for a trace from the server on the default port:

```bash
devtools get-trace <trace-id>
```

Target a DevTools server at another URL with `--url`:

```bash
devtools get-trace <trace-id> --url http://localhost:14401
```

The command prints pretty JSON to stdout. Its `spans` array contains stored
span values without entity metadata, ordered by start time. A missing trace or
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

| Variable        | Default | Description        |
| --------------- | ------- | ------------------ |
| `DEVTOOLS_PORT` | `14400` | Port to listen on. |

## Library exports

- `@pkishorez/devtools/rpc` — the RPC group definition and its tagged errors.
