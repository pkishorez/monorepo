# @pkishorez/devtools

Local DevTools server for telemetry and architecture analysis, with Client
Commands for reading it back

## Big picture

Local development produces traces, logs, and Flow Journals, and a project's
architecture lives in a `laymos.config.json`. DevTools gives all of that one
place. `devtools` starts a loopback server that bundles the browser UI, a
typed RPC endpoint, and OTLP/HTTP ingestion. `devtools snapshot` draws a
Project's changed Modules to a PNG in a headless browser without any server,
which is how a pull request gets its architecture picture. Every other
subcommand is a Client Command that reads Traces and Flows back from a running server as JSON
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

The optional peer `playwright-core` is needed only by `devtools snapshot`,
which drives a headless Chromium through it. The `@pkishorez/devtools/rpc`
subpath is source TypeScript and needs `effect` in the consuming project.

## Exports

### `@pkishorez/devtools/rpc`

The RPC contract the server fulfils and the browser and Client Commands call.
It merges the Lotel, Flow, Laymos, git, Monoverse, and Project registry groups.

| Export                             | What it does                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `DevtoolsRpc`                      | The full RPC group served at `/rpc`.                                               |
| `DevtoolsToolRpc`                  | The Laymos procedures: analyze, module source, source files, docs, stories.        |
| `GitRpc`                           | Branches, changes, file diffs, and known files for any folder in a git repository. |
| `MonoverseRpc`                     | The `AnalyzeMonorepo`, `GetPackageReadme`, and `GetPackageFiles` procedures.       |
| `ProjectRegistryRpc`               | List, add, update, remove registered Projects and resolve their Worktrees.         |
| `InvalidProjectPath`               | Error for a relative, missing, or non-directory project path.                      |
| `ConfigReadError`                  | Error when `laymos.config.json` could not be read.                                 |
| `ConfigParseError`                 | Error when the config is not valid JSON.                                           |
| `ConfigSchemaError`                | Error when the config does not match the schema.                                   |
| `ConfigValidationError`            | Error carrying the config's validation issues.                                     |
| `SourceAnalysisError`              | Error when the source tree could not be analyzed.                                  |
| `ModuleSourceNotFoundError`        | Error for an unknown Configured Module.                                            |
| `ModuleSourceReadError`            | Error when a Module's file could not be read.                                      |
| `SourceFileReadError`              | Error when a requested source file could not be read.                              |
| `DocumentationScopeNotFoundError`  | Error for a documentation scope the config does not declare.                       |
| `DocumentationReadError`           | Error when a docs markdown file could not be read.                                 |
| `StoriesUnavailableError`          | Error when the Story tree could not be loaded, with the reason.                    |
| `InvalidFolderPath`                | Error for a relative, missing, or non-directory folder given to a git procedure.   |
| `GitUnavailableError`              | Error when the folder is not in a repository or git failed.                        |
| `InvalidMonorepoPathError`         | Error for a relative, missing, or non-directory monorepo path.                     |
| `NotPnpmWorkspaceError`            | Error when the folder has no `pnpm-workspace.yaml`.                                |
| `MonorepoReadFailure`              | Error when workspace or manifest files could not be read or parsed.                |
| `PackageReadmeNotFoundError`       | Error when the requested markdown file does not exist in the Package.              |
| `PackageReadmeOutsidePackageError` | Error when the relative path escapes the Package folder.                           |
| `PackageReadmeReadError`           | Error when the markdown file could not be read.                                    |
| `PackageFileReadError`             | Error when one of a Package's files could not be read.                             |
| `ProjectRegistryError`             | Error for a missing entry, an invalid path, or a store failure.                    |
| `RegistryToolSchema`               | `monoverse` or `laymos`: which Tool a registry entry belongs to.                   |
| `ProjectEntrySchema`               | One registered Project with its Worktree resolution.                               |
| `ProjectEntryEntitySchema`         | The stored form of a registry entry.                                               |
| `WorktreeSchema`                   | One git Worktree of a repository.                                                  |
| `WorktreeResolutionSchema`         | Every Worktree of the Project's repository and which one it is in.                 |
| `FlowEntryEntitySchema`            | How the Flow Store keeps one Entry, keyed by id and indexed by Flow id.            |
| `FlowEntryListSchema`              | A page of stored Flow Entries.                                                     |
| `SnapshotRequestSchema`            | What one Snapshot draws: analysis, Change set, theme, size limits, and caption.    |
| `SnapshotRequestJson`              | The JSON codec of a Snapshot Request that crosses from the command into the page.  |
| `SnapshotThemeSchema`              | `light` or `dark`: the theme a Snapshot is drawn in.                               |

### CLI

| Command                                          | What it does                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `devtools [--port] [--db] [--open]`              | Runs the DevTools Server: UI, RPC, and OTLP ingestion on `127.0.0.1:14400`.   |
| `devtools list-traces [--limit 20]`              | Lists recent Trace Summaries, newest first.                                   |
| `devtools get-trace <trace-id>`                  | Returns one Trace: spans in start order with their Log Records.               |
| `devtools list-flows [--limit 20]`               | Lists recent Flows, newest first.                                             |
| `devtools get-flow <flow-id>`                    | Returns one Flow Projection in recorded order.                                |
| `devtools skills [<name>] [--install <dir>]`     | Lists, prints, or installs the shipped agent skill.                           |
| `devtools snapshot [--project] [--base] [--out]` | Draws a Project's changed Modules to a PNG with headless Chromium, no server. |

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

### Put the changed architecture in a pull request

`devtools snapshot` analyzes one Project, marks what changed since a Base ref,
and draws only the changed Modules and their Layers. It opens the bundled
Snapshot page from disk in headless Chromium, so nothing listens on a port.
The `pr:architecture` workflow in this repository runs it for every Project a
pull request touches and puts the pictures in the description.

```sh
# The branch is checked out; compare it with main.
devtools snapshot --project toolkits/kui-toolkit --base origin/main \
  --out .snapshots/kui-toolkit.png --only-changed
# {
#   "baseRef": "c08fd1c…",
#   "modules": 132,
#   "changedModules": 4,
#   "out": "/…/.snapshots/kui-toolkit.png",
#   "width": 512,
#   "height": 806,
#   "scale": 2,
#   "drawn": "changed"
# }

# Then, with a user token, gh 2.99 or later uploads the picture and rewrites
# the reference in the body to the hosted URL.
gh pr edit 42 --body-file body.md --attach .snapshots/kui-toolkit.png
```

How it works:

- `analyzeProject` and `loadChangeSet` from laymos run in-process; the Change
  set is the merge-base of `--base` against the working tree, so check out
  the branch itself and fetch the base.
- The page measures the drawing once, then redraws it at the size the content
  needs, capped at `--max-width` by `--max-height` (1600 CSS pixels each) and
  captured at `--scale` device pixels per CSS pixel (2).
- `--only-changed` writes nothing when no Module changed; otherwise a Project
  with no changed Module is drawn in full. `--include-unchanged` always draws
  every Module. The drawing is dark like DevTools; `--theme light` or
  `DEVTOOLS_THEME=light` draws it light.
- Chromium comes from Playwright's own install when present, else the system
  Chrome, Chromium, or Edge; `--browser` or `DEVTOOLS_BROWSER` names an
  executable directly. GitHub's Ubuntu runners ship Chrome, so the workflow
  installs nothing.
- GitHub refuses image uploads from the workflow's `GITHUB_TOKEN`; the
  description edit needs a personal access token with write access.
