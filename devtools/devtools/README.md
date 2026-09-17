# kstack

The `kstack` CLI runs a local DevTools Server for inspecting OpenTelemetry
data and Laymos project architecture, and reads the telemetry back through
Client Commands.

## Usage

Start the DevTools Server with `npx`:

```bash
npx kstack devtools
```

Or install it globally and run the `kstack` command:

```bash
npm i -g kstack
kstack devtools
```

`kstack` on its own prints help. `kstack devtools` serves its bundled home
page at `http://127.0.0.1:14400`. From there, open:

- `/lotel` to inspect local OpenTelemetry traces and logs.
- `/flow` to inspect Flow Journals as swim lanes, export them, and merge
  journals recorded by different clients.
- `/laymos` to explore the architecture of a local project.

The same loopback server exposes its NDJSON RPC endpoint at `/rpc`, its health
endpoint at `/health`, and its OTLP/HTTP ingestion endpoints at `/v1/traces`
and `/v1/logs`. The UI is part of this package; it does not redirect to or
depend on a hosted application.

## Client Commands

Every `kstack` subcommand other than `devtools` is a Client Command: it reads
from a running DevTools Server instead of serving anything itself. Client
Commands cover Traces and Flows only. Laymos has its own `laymos` CLI.

```bash
kstack list-traces [--limit 20]   # recent Trace Summaries, newest first
kstack get-trace <trace-id>       # one Trace: spans in start order with their logs
kstack list-flows [--limit 20]    # recent Flows, newest first
kstack get-flow <flow-id>         # one Recorded Flow in time order
kstack skills                     # list the skills shipped with kstack
kstack skills devtools            # print the devtools skill
kstack skills --install DIR       # copy every shipped skill into DIR/<name>/
```

Output is JSON by default. `--format text` renders a Trace as its Narrative
view and a Flow as one chronological line per Flow Item. A missing Trace or
Flow, or an unreachable server, is written to stderr with a nonzero exit.

The server URL comes from `--url`, then `DEVTOOLS_URL`, then `DEVTOOLS_PORT`
on `127.0.0.1`, then `http://127.0.0.1:14400`.

### Agent skill

The package ships a skill for coding agents at
`skills/devtools/SKILL.md`. Install it into a project with:

```bash
kstack skills devtools --install .claude/skills
```

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

| Variable        | Default                        | Description                                      |
| --------------- | ------------------------------ | ------------------------------------------------ |
| `DEVTOOLS_PORT` | `14400`                        | Port to listen on; Client Commands also read it. |
| `DEVTOOLS_DB`   | OS-specific DevTools data path | Telemetry SQLite file path.                      |
| `DEVTOOLS_URL`  | derived from `DEVTOOLS_PORT`   | Server URL used by Client Commands.              |

Use `kstack devtools --open` to open the home page in your default browser.
`--port` and `--db` override the matching environment variables.

## Library exports

- `kstack/rpc` — the RPC group definition and its tagged errors.
