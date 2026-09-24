# @pkishorez/devtools

Local DevTools server for telemetry and architecture analysis, with Client
Commands for reading it back

## Big picture

Local development produces traces, logs, and Flow Journals, and a project's
architecture lives in a `laymos.config.json`. DevTools gives all of that one
place. `devtools` starts a loopback server that bundles the browser UI, a
typed RPC endpoint, and OTLP/HTTP ingestion. Every subcommand is a Client
Command that reads Traces and Flows back from a running server as JSON
or text, so a shell or a coding agent can query telemetry without a browser.

The server hosts four Tools. Lotel stores and shows OpenTelemetry data using
[@pkishorez/lotel](../lotel/README.md). Flow stores Journal Entries from
[@pkishorez/flow](../flow/README.md) and draws them as swim lanes. Laymos and
Monoverse analyze one project or one pnpm monorepo through
[laymos](../laymos/README.md). Applications send telemetry with
[@pkishorez/effect-tracer](../effect-tracer/README.md).

Terms are defined in [CONTEXT.md](./CONTEXT.md) and, for Monoverse,
[docs/monoverse.md](./docs/monoverse.md). Decisions are in
[docs/adr/](./docs/adr/). The agent skill shipped with the package is in
[skills/devtools/SKILL.md](./skills/devtools/SKILL.md).

## Install

```sh
npm i -g @pkishorez/devtools
```

Or run it without installing: `npx @pkishorez/devtools`.

The package has no peer dependencies. The `@pkishorez/devtools/rpc` subpath is source
TypeScript and needs `effect` in the consuming project.

## Exports

### `@pkishorez/devtools/rpc`

The RPC contract the server fulfils and the browser and Client Commands call.
It merges the Lotel, Flow, Laymos, Monoverse, and Project registry groups.

| Export                             | What it does                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `DevtoolsRpc`                      | The full RPC group served at `/rpc`.                                                                      |
| `DevtoolsToolRpc`                  | The Laymos procedures: analyze, module source, source files, docs, branches, changes, file diff, stories. |
| `MonoverseRpc`                     | The `AnalyzeMonorepo` and `GetPackageReadme` procedures.                                                  |
| `ProjectRegistryRpc`               | List, add, update, remove registered Projects and resolve their Worktrees.                                |
| `InvalidProjectPath`               | Error for a relative, missing, or non-directory project path.                                             |
| `ConfigReadError`                  | Error when `laymos.config.json` could not be read.                                                        |
| `ConfigParseError`                 | Error when the config is not valid JSON.                                                                  |
| `ConfigSchemaError`                | Error when the config does not match the schema.                                                          |
| `ConfigValidationError`            | Error carrying the config's validation issues.                                                            |
| `SourceAnalysisError`              | Error when the source tree could not be analyzed.                                                         |
| `ModuleSourceNotFoundError`        | Error for an unknown Configured Module.                                                                   |
| `ModuleSourceReadError`            | Error when a Module's file could not be read.                                                             |
| `SourceFileReadError`              | Error when a requested source file could not be read.                                                     |
| `DocumentationScopeNotFoundError`  | Error for a documentation scope the config does not declare.                                              |
| `DocumentationReadError`           | Error when a docs markdown file could not be read.                                                        |
| `StoriesUnavailableError`          | Error when the Story tree could not be loaded, with the reason.                                           |
| `GitUnavailableError`              | Error when the project is not a repository or git failed.                                                 |
| `InvalidMonorepoPathError`         | Error for a relative, missing, or non-directory monorepo path.                                            |
| `NotPnpmWorkspaceError`            | Error when the folder has no `pnpm-workspace.yaml`.                                                       |
| `MonorepoReadFailure`              | Error when workspace or manifest files could not be read or parsed.                                       |
| `PackageReadmeNotFoundError`       | Error when the requested markdown file does not exist in the Package.                                     |
| `PackageReadmeOutsidePackageError` | Error when the relative path escapes the Package folder.                                                  |
| `PackageReadmeReadError`           | Error when the markdown file could not be read.                                                           |
| `ProjectRegistryError`             | Error for a missing entry, an invalid path, or a store failure.                                           |
| `RegistryToolSchema`               | `monoverse` or `laymos`: which Tool a registry entry belongs to.                                          |
| `ProjectEntrySchema`               | One registered Project with its Worktree resolution.                                                      |
| `ProjectEntryEntitySchema`         | The stored form of a registry entry.                                                                      |
| `WorktreeSchema`                   | One git Worktree of a repository.                                                                         |
| `WorktreeResolutionSchema`         | Every Worktree of the Project's repository and which one it is in.                                        |
| `FlowEntryEntitySchema`            | How the Flow Store keeps one Entry, keyed by id and indexed by Flow id.                                   |
| `FlowEntryListSchema`              | A page of stored Flow Entries.                                                                            |

### CLI

| Command                                      | What it does                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `devtools [--port] [--db] [--open]`          | Runs the DevTools Server: UI, RPC, and OTLP ingestion on `127.0.0.1:14400`. |
| `devtools list-traces [--limit 20]`          | Lists recent Trace Summaries, newest first.                                 |
| `devtools get-trace <trace-id>`              | Returns one Trace: spans in start order with their Log Records.             |
| `devtools list-flows [--limit 20]`           | Lists recent Flows, newest first.                                           |
| `devtools get-flow <flow-id>`                | Returns one Flow Projection in recorded order.                              |
| `devtools skills [<name>] [--install <dir>]` | Lists, prints, or installs the shipped agent skill.                         |

Client Commands take `--url` and `--format json|text`. The server URL comes
from `--url`, then `DEVTOOLS_URL`, then `DEVTOOLS_PORT` on `127.0.0.1`, then
`http://127.0.0.1:14400`. The server reads `DEVTOOLS_PORT` and `DEVTOOLS_DB`
when the flags are absent.

## Usage

### Start the server and send telemetry to it

Run the server, then point an application's telemetry layer at it. Traces,
logs, and Flow Entries from every process land in one SQLite file.

```sh
devtools --open
# devtools running on http://127.0.0.1:14400
```

```ts
import { Effect, Layer, ManagedRuntime } from 'effect';
import { makeDevTelemetryLayer } from '@pkishorez/effect-tracer/telemetry/dev-telemetry';
import { FlowTelemetry } from '@pkishorez/flow';

const endpoint = 'http://127.0.0.1:14400';

// One runtime per process; each names itself so lanes stay apart.
const runtimeFor = (origin: string) =>
  ManagedRuntime.make(
    Layer.merge(
      FlowTelemetry.layer({ endpoint, origin }),
      makeDevTelemetryLayer({ endpoint, serviceName: origin }),
    ),
  );

const server = runtimeFor('server:api-1');

await server.runPromise(
  Effect.log('order accepted').pipe(Effect.withSpan('handle-order')),
);

// Disposing drains the last batch.
await server.dispose();
```

How it works:

- The server listens on loopback only and serves `/`, `/lotel`, `/flow`,
  `/laymos`, `/monoverse`, `/rpc`, `/health`, `/v1/traces`, and `/v1/logs`.
- `makeDevTelemetryLayer` posts OTLP/HTTP JSON to `/v1/traces` and `/v1/logs`.
- `FlowTelemetry.layer` posts Flow Entries to `/rpc`; Entries recorded inside
  a span carry its trace id, so the Flow view links to the trace.

### Read telemetry back from a shell

Client Commands query the running server. JSON is the default so output can be
piped; `--format text` renders a Trace as its Narrative and a Flow as one
line per Entry.

```sh
devtools list-traces --limit 5
devtools get-trace 4bf92f3577b34da6a3ce929d0e0e4736 --format text
devtools list-flows
devtools get-flow order:42 --format text

# Install the agent skill so a coding agent knows these commands.
devtools skills devtools --install .claude/skills
```

How it works:

- Each command opens an Effect RPC client over NDJSON against `DevtoolsRpc`
  at `<url>/rpc`.
- A missing Trace or Flow, or an unreachable server, is written to stderr
  with a nonzero exit.
- Laymos is not covered by Client Commands; use the `laymos` CLI.
