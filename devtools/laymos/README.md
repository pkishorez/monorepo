# laymos

Enforces architectural dependency rules and explores source dependencies.

## Big picture

A project's architecture usually lives in people's heads. laymos moves it into
a plain `laymos.config.json`: Layers group source paths, Modules draw disjoint
boundaries inside a Layer, and LayerGraphs say which Layers may depend on
which. `laymos lint` compares that intent with the real import graph and
reports every gap. `laymos inspect` answers the reverse question: given a
file or Module, what does it depend on and who is allowed to reach it.

The same config can point at a folder of Stories: small executable narratives
that prove a behavior and keep their proof next to the prose. `laymos stories`
runs them and reports a verdict per Story.

The library entry does everything the CLI does, so other tools can host it.
[@pkishorez/devtools](../devtools/README.md) serves Architecture Analyses, change sets, and
Story reports over RPC to its browser UI using the browser-safe schema
subpaths. Stories capture traces with
[@pkishorez/effect-tracer](../effect-tracer/README.md) and Flows with
[@pkishorez/flow](../flow/README.md).

Terms are defined in [CONTEXT.md](./CONTEXT.md). Decisions are in
[docs/adr/](./docs/adr/). The config reference is in
[docs/config.md](./docs/config.md) and the CLI reference in
[docs/cli.md](./docs/cli.md).

## Install

```sh
pnpm add -D laymos
```

Peer dependencies:

- `effect` (`4.0.0-rc.112`): every library function returns an Effect, and
  Stories are written as Effects.

## Exports

### `laymos`

Node-only. Reads the config, walks the source tree, and runs git.

| Export                                                                                                                             | What it does                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `analyzeProject`                                                                                                                   | Reads a config path and returns the full Architecture Analysis: config, Layer and Module analysis. |
| `inspectProject`                                                                                                                   | Summarizes the whole Project for the `inspect project` view.                                       |
| `inspectLayer`                                                                                                                     | Reports one Layer's paths, allowed links, Modules, and violations.                                 |
| `inspectFile`                                                                                                                      | Reports one file's Layer, Module, boundary role, and dependencies, optionally recursive.           |
| `inspectModule`                                                                                                                    | Reports one Configured Module's visibility, shape, entry points, and dependency tree.              |
| `InspectionTargetNotFound`                                                                                                         | Error when the inspected file, Layer, or Module does not exist.                                    |
| `ModuleInspectionCycle`                                                                                                            | Error when the inspected Module sits in a dependency cycle.                                        |
| `loadModuleSource`                                                                                                                 | Returns the paths and contents of every source file assigned to one Configured Module.             |
| `ModuleSourceNotFound`                                                                                                             | Error when the requested Module is not configured.                                                 |
| `ModuleSourceReadError`                                                                                                            | Error when one of the Module's files could not be read.                                            |
| `loadSourceFiles`                                                                                                                  | Returns the contents of included source files under the given path prefixes.                       |
| `SourceFileReadError`                                                                                                              | Error when one of those files could not be read.                                                   |
| `loadDocumentation`                                                                                                                | Reads the markdown declared by `docsPath` for a Layer, LayerGraph, Module, or Module Graph scope.  |
| `DocumentationScopeNotFound`                                                                                                       | Error when the scope names something the config does not declare.                                  |
| `DocumentationReadError`                                                                                                           | Error when the markdown file could not be read.                                                    |
| `getStoryTree`                                                                                                                     | Loads the Story tree from `storiesPath` without running anything.                                  |
| `planStories`                                                                                                                      | Loads and scopes Stories, then returns the total and a Stream of reports as they finish.           |
| `runStories`                                                                                                                       | Same as `planStories` but returns only the report Stream.                                          |
| `StoriesError`                                                                                                                     | Error for a missing `storiesPath`, a bad root, duplicate titles, or an invalid timeout.            |
| `loadBranches`                                                                                                                     | Lists the git branches of the project's repository.                                                |
| `loadChangeSet`                                                                                                                    | Lists paths added or modified against a base ref, default `HEAD`.                                  |
| `loadFileDiff`                                                                                                                     | Returns the hunks of one file against a base ref.                                                  |
| `GitError`                                                                                                                         | Error when the folder is not a repository, the ref is unknown, or git failed.                      |
| `ConfigError`                                                                                                                      | Error when the config could not be read, parsed, decoded, or validated.                            |
| `CruiseError`                                                                                                                      | Error when the source tree could not be walked or parsed.                                          |
| `ArchitectureAnalysisSchema`                                                                                                       | Re-export from `laymos/architecture-analysis-schema`.                                              |
| `ModuleSourceSnapshotSchema`                                                                                                       | Re-export from `laymos/architecture-analysis-schema`.                                              |
| `DocumentationScopeSchema`                                                                                                         | Re-export from `laymos/architecture-analysis-schema`.                                              |
| `DocumentationSchema`                                                                                                              | Re-export from `laymos/architecture-analysis-schema`.                                              |
| `StoryReportSchema`                                                                                                                | Re-export from `laymos/story/schema`.                                                              |
| `StoryTreeSchema`                                                                                                                  | Re-export from `laymos/story/schema`.                                                              |
| `BranchSchema`, `ChangedPathSchema`, `ChangeSetSchema`, `ChangeStatusSchema`, `DiffHunkSchema`, `DiffLineSchema`, `FileDiffSchema` | Re-exports from `laymos/change-set-schema`.                                                        |

### `laymos/architecture-analysis-schema`

Browser-safe. Schemas only; no file system access.

| Export                        | What it does                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `ArchitectureAnalysisSchema`  | The wire contract for an Architecture Analysis; its Maps and Sets encode to JSON.                  |
| `LayerAnalysisSchema`         | Layer membership, unassigned files, forbidden imports, and Layers without Modules.                 |
| `ModuleAnalysisSchema`        | Analyzed Modules, Module Graphs, dependencies, and Module violations.                              |
| `ProjectConfigSchema`         | The decoded config with every key present.                                                         |
| `ProjectConfigInputSchema`    | The authoring config, where optional keys fall back to defaults.                                   |
| `ConfigValidationIssueSchema` | One validation problem with its kind and message.                                                  |
| `ModuleSourceFileSchema`      | One source file path with its contents.                                                            |
| `ModuleSourceSnapshotSchema`  | The files of one Configured Module.                                                                |
| `DocumentationScopeSchema`    | Which entity a documentation request targets: `module`, `module-graph`, `layer`, or `layer-graph`. |
| `DocumentationSchema`         | The resolved markdown for one scope, or its absence.                                               |

### `laymos/change-set-schema`

Browser-safe.

| Export               | What it does                                                            |
| -------------------- | ----------------------------------------------------------------------- |
| `ChangeStatusSchema` | `added` or `modified`.                                                  |
| `ChangedPathSchema`  | One changed path with its status.                                       |
| `ChangeSetSchema`    | Every changed path against a base ref.                                  |
| `DiffLineSchema`     | One line of a diff hunk.                                                |
| `DiffHunkSchema`     | One hunk of a file diff.                                                |
| `FileDiffSchema`     | The hunks of one file.                                                  |
| `BranchSchema`       | One local or remote-tracking branch, with `remote` and `current` flags. |

### `laymos/story`

For Story files. Runs in Node under the Story runner.

| Export           | What it does                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `Story.make`     | Builds a Story from a title, description, source URL, and questions; `spine` defaults to false. |
| `Story.question` | Builds one question with its prose answer and its proof Effect.                                 |
| `Story.group`    | Builds a Story Group from a title, description, and children.                                   |
| `Story.trace`    | Runs an Effect under a trace recorder and attaches the captured trace to the report.            |
| `Story.flow`     | Runs an Effect with a memory Flow sink and attaches every Journal to the report.                |
| `Story.assert`   | Records a named pass or fail that decides the question's verdict.                               |
| `StoryContext`   | The service the runner injects; `Story.trace`, `Story.flow`, and `Story.assert` use it.         |
| `isStory`        | Type guard for a Story value.                                                                   |
| `isStoryGroup`   | Type guard for a Story Group value.                                                             |

### `laymos/story/schema`

Browser-safe.

| Export                  | What it does                                                  |
| ----------------------- | ------------------------------------------------------------- |
| `StoryTreeSchema`       | The root Story Group with its nested groups and Story leaves. |
| `StoryTreeGroupSchema`  | One group node of the tree.                                   |
| `StoryLeafSchema`       | One Story with its id, page, source, setup, and questions.    |
| `QuestionLeafSchema`    | One question with its slug, answer, and proof snippet.        |
| `StoryPageSchema`       | The markdown page attached to a Story or group.               |
| `StorySourceSchema`     | The path and contents of a Story file.                        |
| `StoryReportSchema`     | The verdict and per-question reports of one Story run.        |
| `QuestionReportSchema`  | One question's sections, assertions, and verdict.             |
| `QuestionSectionSchema` | A captured trace or Flow Journal section.                     |
| `CapturedTraceSchema`   | The spans and logs captured by `Story.trace`.                 |
| `JournalSchema`         | The Flow Journal captured by `Story.flow`.                    |
| `StoryAssertionSchema`  | One assertion with its description and result.                |
| `StoryVerdictSchema`    | `passed`, `failed`, or `errored`.                             |
| `slugifyQuestion`       | Turns a question string into its URL slug.                    |

### `laymos/skills-command`

| Export              | What it does                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| `makeSkillsCommand` | Builds a `skills` CLI subcommand that lists, prints, or installs skill folders. |

### CLI

| Command                                             | What it does                                                  |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `laymos lint`                                       | Checks every rule and Story page; exits 1 on violations.      |
| `laymos lint layers`                                | Checks Layer coverage and cross-Layer rules.                  |
| `laymos lint modules`                               | Checks Module coverage, boundaries, dependencies, and cycles. |
| `laymos inspect project [--json]`                   | Summarizes the whole architecture.                            |
| `laymos inspect layer <name> [--json]`              | Shows one Layer and its Modules.                              |
| `laymos inspect file <path> [--recursive] [--json]` | Shows a file's Layer, Module, and dependency tree.            |
| `laymos inspect module <path> [--json]`             | Shows a Configured Module's identity and dependencies.        |
| `laymos stories [--concurrency <n>]`                | Runs every Story and prints each verdict.                     |
| `laymos skills [<name>] [--install <dir>]`          | Lists, prints, or installs the shipped agent skills.          |

Details and exit codes are in [docs/cli.md](./docs/cli.md).

## Usage

### Analyze a project from Node

Read a config and get the full Architecture Analysis as one value. This is
what the CLI and the DevTools server both do first.

```ts
import { Effect, Schema } from 'effect';
import { analyzeProject, ArchitectureAnalysisSchema } from 'laymos';

const analysis = await analyzeProject('./laymos.config.json').pipe(
  Effect.runPromise,
);

analysis.config.sourceRoots; // ['src']
analysis.layerAnalysis.unassignedFiles; // files with no Layer
analysis.moduleAnalysis.violations; // e.g. { kind: 'boundary', fromFile, toFile, ... }

// Send it over the wire: Maps and Sets encode to plain JSON.
const codec = Schema.toCodecJson(ArchitectureAnalysisSchema);
const json = Schema.encodeSync(codec)(analysis);
```

How it works:

- `analyzeProject` loads and validates the config, walks `sourceRoots` with
  oxc, and runs Layer and Module analysis.
- Failures are typed: `ConfigError` for the config, `CruiseError` for the
  source walk.
- `ArchitectureAnalysisSchema` is the same contract the browser decodes.

### Write a Story

A Story file exports Stories built with `Story.make`. Each question holds a
prose answer and a proof Effect. `Story.assert` decides the verdict.

```ts
import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { assignee: Schema.NullOr(Schema.String) }, (previous) => ({
    ...previous,
    assignee: null,
  }))
  .build();

export const appendAVersion = Story.make({
  title: 'Append a version, never edit one',
  description: 'Old rows still read after a new version is added.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Do rows written before v2 still read?', {
      answer: 'Yes. The v1 shape is untouched, so a v1 row walks to v2.',
      proof: Effect.gen(function* () {
        const oldest = yield* Task.decode({
          _v: 'v1',
          taskId: 't1',
          boardId: 'work',
          title: 'Write the plan',
        });
        yield* Story.assert('a v1 row arrives at v2', oldest.assignee === null);
        return { oldest };
      }),
    }),
  ],
});
```

How it works:

- `storiesPath/index.ts` default-exports a `Story.group` that lists every
  Story; `laymos stories` imports it with tsx and runs each proof.
- The runner provides `StoryContext`; `Story.assert` writes into it.
- Wrap a proof in `Story.trace` or `Story.flow` to attach a trace or a Flow
  Journal to the report.

### Run Stories and stream reports

Host the Story runner in your own process and consume reports as they finish.

```ts
import { Effect, Stream } from 'effect';
import { getStoryTree, planStories } from 'laymos';

const tree = await getStoryTree('./laymos.config.json').pipe(Effect.runPromise);
tree.groups.map((group) => group.title);

const program = Effect.gen(function* () {
  const { total, reports } = yield* planStories('./laymos.config.json', {
    concurrency: 4,
  });
  const collected = yield* Stream.runCollect(reports);
  const failed = [...collected].filter((r) => r.verdict !== 'passed');
  return { total, failed: failed.length };
});

await Effect.runPromise(program);
```

How it works:

- `getStoryTree` loads the tree without running proofs; the DevTools UI uses it
  to render the outline.
- `planStories` returns the count up front and a `Stream` of `StoryReport`
  so a UI can show progress.
- Pass `scope` to run one group or Story by id; a `StoriesError` with reason
  `unknown-scope` is returned when it does not match.
