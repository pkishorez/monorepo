# @kishorez/devtools

A local devtools RPC server for inspecting a project's dependency graph.

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

The server listens on `http://127.0.0.1:14400/rpc` and exposes an NDJSON RPC
endpoint (with CORS enabled) for running dependency-cruiser analysis against a
project directory.

## Configuration

| Variable        | Default     | Description        |
| --------------- | ----------- | ------------------ |
| `DEVTOOLS_HOST` | `127.0.0.1` | Host to bind to.   |
| `DEVTOOLS_PORT` | `14400`     | Port to listen on. |

## Library exports

- `@kishorez/devtools/rpc` — the RPC group definition and shared types.
- `@kishorez/devtools/report` — programmatic report generation for a directory.
