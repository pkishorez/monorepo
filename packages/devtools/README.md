# @kishorez/devtools

A local DevTools server for inspecting dependency graphs and OpenTelemetry data.

## Usage

Start the server with `npx`:

```bash
npx @kishorez/devtools
```

Or install it globally and run the `devtools` command:

```bash
npm i -g @kishorez/devtools
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

## Configuration

| Variable        | Default | Description        |
| --------------- | ------- | ------------------ |
| `DEVTOOLS_PORT` | `14400` | Port to listen on. |

## Library exports

- `@kishorez/devtools/rpc` — the RPC group definition and shared types,
  including the programmatic `GetTrace` procedure.
- `@kishorez/devtools/report` — programmatic report generation for a directory.
