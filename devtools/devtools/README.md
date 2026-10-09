# @kstackz/devtools

Local DevTools server for telemetry and architecture analysis, with Client
Commands for reading it back

## Big picture

Local development produces traces and logs, and a project's architecture
lives in a `laymos.config.json`. DevTools gives all of that one place.
`devtools` starts a loopback server that bundles the browser UI, a typed RPC
endpoint, and OTLP/HTTP ingestion. Every subcommand is a Client Command that
reads Traces back from a running server as JSON or text, so a shell or a
coding agent can query telemetry without a browser.

The server hosts three Tools. Lotel stores and shows OpenTelemetry data using
[@kstackz/lotel](../lotel/README.md). Laymos and Monoverse analyze one project or one monorepo through
[laymos](../laymos/README.md). Applications send telemetry with
[@kstackz/effect-tracer](../effect-tracer/README.md). The Tools' views come
from the private [@devtools/ui](../ui/README.md), which is a devDependency
bundled into the browser UI at build time, so it is never installed.

Terms are defined in [CONTEXT.md](./CONTEXT.md) and, for Monoverse,
[docs/monoverse.md](./docs/monoverse.md). Decisions are in
[docs/adr/](./docs/adr/). The agent skill shipped with the package is in
[skills/devtools/SKILL.md](./skills/devtools/SKILL.md).

## Install

```sh
npm i -g @kstackz/devtools
```

Or run it without installing: `npx @kstackz/devtools`.

It has no peer dependencies. The `@kstackz/devtools/rpc` subpath is source TypeScript and needs `effect` in the consuming project.

## Exports

### `@kstackz/devtools/rpc`

The RPC contract the server fulfils and the browser and Client Commands call.
It merges the Lotel, Laymos, git, Monoverse, and Project registry groups.

| Export                             | What it does                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DevtoolsRpc`                      | The full RPC group served at `/rpc`.                                                                           |
| `DevtoolsToolRpc`                  | The Laymos procedures: analyze, a Module's File list, one file, Story tree, saved Proof reports, Stories runs. |
| `GitRpc`                           | Branches, changes, file diffs, and known files for any folder in a git repository.                             |
| `MonoverseRpc`                     | The `AnalyzeMonorepo` and `GetMonorepoFile` procedures.                                                        |
| `ProjectRegistryRpc`               | List, add, update, remove registered Projects and resolve their Worktrees.                                     |
| `InvalidProjectPath`               | Error for a relative, missing, or non-directory project path.                                                  |
| `ConfigReadError`                  | Error when `laymos.config.json` could not be read.                                                             |
| `ConfigParseError`                 | Error when the config is not valid JSON.                                                                       |
| `ConfigSchemaError`                | Error when the config does not match the schema.                                                               |
| `ConfigValidationError`            | Error carrying the config's validation issues.                                                                 |
| `SourceAnalysisError`              | Error when the source tree could not be analyzed.                                                              |
| `FileNotFoundError`                | Error for a Module or file path the Project does not hold.                                                     |
| `FileReadError`                    | Error when a Project file could not be read.                                                                   |
| `StoriesUnavailableError`          | Error when Stories could not be loaded or scoped, with the reason.                                             |
| `InvalidFolderPath`                | Error for a relative, missing, or non-directory folder given to a git procedure.                               |
| `GitUnavailableError`              | Error when the folder is not in a repository or git failed.                                                    |
| `InvalidMonorepoPathError`         | Error for a relative, missing, or non-directory monorepo path.                                                 |
| `NotAMonorepoError`                | Error when the folder has neither `pnpm-workspace.yaml` nor a `workspaces` field in its `package.json`.        |
| `MonorepoReadFailure`              | Error when workspace or manifest files could not be read or parsed.                                            |
| `PackageReadmeNotFoundError`       | Error when the requested markdown file does not exist in the Package.                                          |
| `PackageReadmeOutsidePackageError` | Error when the relative path escapes the Package folder.                                                       |
| `PackageReadmeReadError`           | Error when the markdown file could not be read.                                                                |
| `PackageFileReadError`             | Error when one of a Package's files could not be read.                                                         |
| `ProjectRegistryError`             | Error for a missing entry, an invalid path, or a store failure.                                                |
| `RegistryToolSchema`               | `monoverse` or `laymos`: which Tool a registry entry belongs to.                                               |
| `ProjectEntrySchema`               | One registered Project with its Worktree resolution.                                                           |
| `ProjectEntryEntitySchema`         | The stored form of a registry entry.                                                                           |
| `WorktreeSchema`                   | One git Worktree of a repository.                                                                              |
| `WorktreeResolutionSchema`         | Every Worktree of the Project's repository and which one it is in.                                             |

### CLI

| Command                                      | What it does                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `devtools [--port] [--db] [--open]`          | Runs the DevTools Server: UI, RPC, and OTLP ingestion on `127.0.0.1:14400`. |
| `devtools list-traces [--limit 20]`          | Lists recent Trace Summaries, newest first.                                 |
| `devtools get-trace <trace-id>`              | Returns one Trace: spans in start order with their Log Records.             |
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
import { makeDevTelemetryLayer } from '@kstackz/effect-tracer/telemetry/dev-telemetry';

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

- The server listens on loopback only and serves `/`, `/lotel`, `/laymos`,
  `/monoverse`, `/rpc`, `/health`, `/story-evidence`, `/v1/traces`, and
  `/v1/logs`. `/story-evidence?project=&proof=&file=` serves one file from a
  Proof's `.laymos/stories/<proof id>/` Evidence folder and nothing outside it.
- `makeDevTelemetryLayer` posts OTLP/HTTP JSON to `/v1/traces` and `/v1/logs`.

### Read telemetry back from a shell

Client Commands query the running server. JSON is the default so output can be
piped; `--format text` renders a Trace as its Narrative.

```sh
devtools list-traces --limit 5
devtools get-trace 4bf92f3577b34da6a3ce929d0e0e4736 --format text

# Install the agent skill so a coding agent knows these commands.
devtools skills devtools --install .claude/skills
```

How it works:

- Each command opens an Effect RPC client over NDJSON against `DevtoolsRpc`
  at `<url>/rpc`.
- A missing Trace, or an unreachable server, is written to stderr
  with a nonzero exit.
- Laymos is not covered by Client Commands; use the `laymos` CLI.
