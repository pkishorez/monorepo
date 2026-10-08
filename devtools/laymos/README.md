# laymos

Enforces architectural dependency rules and explores source dependencies.

## Big picture

A project's architecture usually lives in people's heads. laymos moves it into
a plain `laymos.config.json`: Layers group source paths, Modules draw disjoint
boundaries inside a Layer, and LayerGraphs say which Layers may depend on
which. `laymos lint` compares that intent with the real import graph and
reports every gap. `laymos inspect` answers the reverse question: given a
file or Module, what does it depend on and who is allowed to reach it.

The same config can point at a folder of Stories that teach the Project to its
Reader. Each folder is a Story told by its `story.md`, from the top Story's
pitch down to one part's edge cases; the `*.proof.ts` files beside it are its
Proofs. A Proof is one claim in one file: given a Preparation, when an Action
is performed, a Verification holds. It runs in the process or, for UI, in a
real Chromium at a person's pace, and every run keeps Evidence a reader can
judge: each phase's value, a trace, and for browser Proofs a Recording of every
Tab. `laymos stories` runs them and prints the Story tree with a verdict per
Proof. How to write a Telling is in
[docs/writing-stories.md](./docs/writing-stories.md).

The library entry does everything the CLI does, so other tools can host it.
[@kstackz/devtools](../devtools/README.md) serves Architecture Analyses, change sets, and
Proof reports over RPC to its browser UI using the browser-safe schema
subpaths, and plays Recordings back on the Stories canvas. Stories capture
traces with [@kstackz/effect-tracer](../effect-tracer/README.md).

Terms are defined in [CONTEXT.md](./CONTEXT.md). Decisions are in
[docs/adr/](./docs/adr/); the Story model is
[ADR-0018](./docs/adr/0018-stories-are-a-tree-of-tellings.md), and a Proof is
[ADR-0017](./docs/adr/0017-a-story-is-one-self-contained-claim.md). The config reference is in
[docs/config.md](./docs/config.md) and the CLI reference in
[docs/cli.md](./docs/cli.md).

## Install

```sh
pnpm add -D laymos
```

Peer dependencies:

- `effect` (`^4.0.0`): every library function returns an Effect, and
  Proofs are written as Effects.
- `playwright-core` (`1.63.0`, optional): drives Chromium for browser Proofs.
  Install the browser once with `npx playwright install chromium`.
- `vite` (`^8.0.0`, optional): serves each browser Proof's page with the
  Project's own Vite config.

## Exports

### `laymos`

Node-only. Reads the config, walks the source tree, and runs git.

| Export                                                                                                                             | What it does                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `analyzeProject`                                                                                                                   | Reads a config path and returns the full Architecture Analysis: config, Layer and Module analysis.                         |
| `inspectProject`                                                                                                                   | Summarizes the whole Project for the `inspect project` view.                                                               |
| `inspectLayer`                                                                                                                     | Reports one Layer's paths, allowed links, Modules, and violations.                                                         |
| `inspectFile`                                                                                                                      | Reports one file's Layer, Module, boundary role, and dependencies, optionally recursive.                                   |
| `inspectModule`                                                                                                                    | Reports one Configured Module's visibility, shape, entry points, and dependency tree.                                      |
| `InspectionTargetNotFound`                                                                                                         | Error when the inspected file, Layer, or Module does not exist.                                                            |
| `ModuleInspectionCycle`                                                                                                            | Error when the inspected Module sits in a dependency cycle.                                                                |
| `loadModuleSource`                                                                                                                 | Returns the paths and contents of every source file assigned to one Configured Module.                                     |
| `ModuleSourceNotFound`                                                                                                             | Error when the requested Module is not configured.                                                                         |
| `ModuleSourceReadError`                                                                                                            | Error when one of the Module's files could not be read.                                                                    |
| `loadSourceFiles`                                                                                                                  | Returns the contents of included source files under the given path prefixes.                                               |
| `SourceFileReadError`                                                                                                              | Error when one of those files could not be read.                                                                           |
| `loadDocumentation`                                                                                                                | Reads the markdown declared by `docsPath` for a Layer, LayerGraph, Module, or Module Graph scope.                          |
| `DocumentationScopeNotFound`                                                                                                       | Error when the scope names something the config does not declare.                                                          |
| `DocumentationReadError`                                                                                                           | Error when the markdown file could not be read.                                                                            |
| `getStoryTree`                                                                                                                     | Loads the Story tree from `storiesPath`: each folder's Telling, its Proofs, and Telling issues, without running any Proof. |
| `findTellingIssues`                                                                                                                | Lists every Telling issue in the tree without importing any Proof file.                                                    |
| `planStories`                                                                                                                      | Loads the tree and scopes it to a Story or Proof id, then returns the total, the scoped tree, and a Stream of run events.  |
| `runStories`                                                                                                                       | Same as `planStories` but returns only the Stream of `Started` and `Finished` events.                                      |
| `loadStoryReports`                                                                                                                 | Reads every saved `report.json` whose Proof is still in the tree.                                                          |
| `StoriesError`                                                                                                                     | Error for a missing `storiesPath`, an unloadable or invalid Proof file, an unknown scope, or a bad timeout.                |
| `loadBranches`                                                                                                                     | Lists the git branches of the project's repository.                                                                        |
| `loadChangeSet`                                                                                                                    | Lists paths added or modified against a base ref, default `HEAD`.                                                          |
| `loadFileDiff`                                                                                                                     | Returns the hunks of one file against a base ref.                                                                          |
| `GitError`                                                                                                                         | Error when the folder is not a repository, the ref is unknown, or git failed.                                              |
| `ConfigError`                                                                                                                      | Error when the config could not be read, parsed, decoded, or validated.                                                    |
| `CruiseError`                                                                                                                      | Error when the source tree could not be walked or parsed.                                                                  |
| `ArchitectureAnalysisSchema`                                                                                                       | Re-export from `laymos/architecture-analysis-schema`.                                                                      |
| `ModuleSourceSnapshotSchema`                                                                                                       | Re-export from `laymos/architecture-analysis-schema`.                                                                      |
| `DocumentationScopeSchema`                                                                                                         | Re-export from `laymos/architecture-analysis-schema`.                                                                      |
| `DocumentationSchema`                                                                                                              | Re-export from `laymos/architecture-analysis-schema`.                                                                      |
| `ProofReportSchema`                                                                                                                | Re-export from `laymos/story/schema`.                                                                                      |
| `ProofRunEventSchema`                                                                                                              | Re-export from `laymos/story/schema`.                                                                                      |
| `StoryTreeSchema`                                                                                                                  | Re-export from `laymos/story/schema`.                                                                                      |
| `BranchSchema`, `ChangedPathSchema`, `ChangeSetSchema`, `ChangeStatusSchema`, `DiffHunkSchema`, `DiffLineSchema`, `FileDiffSchema` | Re-exports from `laymos/change-set-schema`.                                                                                |

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

For Proof files. Browser-safe: Proof files are imported by the runner in Node
and by the page in the browser.

| Export            | What it does                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Proof.make`      | Builds a process Proof from a title, `prepare`, `act`, and `verify`; optional description, Critical mark, timeout. |
| `Proof.browser`   | Builds a browser Proof: `page` mounts the UI in the page, `prepare` opens Devices and Tabs.                        |
| `Proof.assert`    | Records a described pass or fail in the current phase.                                                             |
| `Proof.budget`    | Asserts every span with a name recorded so far ended within a Duration; a missing span fails.                      |
| `Gesture.tap`     | One finger touches a target in a short, visible hold.                                                              |
| `Gesture.press`   | One finger holds on a target, one second unless told otherwise.                                                    |
| `Gesture.swipe`   | One or more fingers sweep across a target in a direction.                                                          |
| `Gesture.drag`    | One finger carries a target to another target or a point.                                                          |
| `Gesture.pinch`   | Two fingers spread or close on a target by a scale.                                                                |
| `Gesture.rotate`  | Two fingers turn on a target by degrees.                                                                           |
| `Gesture.fingers` | Any number of fingers, each along its own timed path.                                                              |
| `ProofContext`    | The service the runner provides to every phase; `Proof.assert` and `Proof.budget` use it.                          |
| `isProof`         | Type guard for a Proof value.                                                                                      |

### `laymos/story/schema`

Browser-safe.

| Export                 | What it does                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `StoryTreeSchema`      | The top Story of the tree.                                                                              |
| `StoryNodeSchema`      | One Story: id, title, pitch, body, its Proofs, sub-Stories, and Telling issues.                         |
| `TellingIssueSchema`   | `missing-telling`, `incomplete-telling`, `broken-link`, or `unnamed-part`, with its target and message. |
| `ProofLeafSchema`      | One Proof: id, name, title, description, Venue, Critical mark, and the source of its file.              |
| `ProofSourceSchema`    | The path and contents of a Proof file.                                                                  |
| `VenueSchema`          | `process` or `browser`.                                                                                 |
| `ProofReportSchema`    | One Proof run: verdict, phases, trace, Steps, and Recordings.                                           |
| `ProofRunEventSchema`  | `Started` or `Finished` with the report, streamed by a Stories run.                                     |
| `ProofVerdictSchema`   | `passed`, `failed`, `errored`, or `unprepared`.                                                         |
| `PhaseReportSchema`    | One phase: status, timing, returned value or error, and assertions.                                     |
| `PhaseNameSchema`      | `prepare`, `act`, or `verify`.                                                                          |
| `PhaseStatusSchema`    | `passed`, `failed`, `errored`, or `skipped`.                                                            |
| `ProofAssertionSchema` | One assertion with its description and result.                                                          |
| `CapturedTraceSchema`  | Every span and log recorded during the run.                                                             |
| `StepSchema`           | One named Step on one Tab, with its phase, timing, outcome, and screenshot.                             |
| `StepKindSchema`       | `open`, `click`, `type`, `press`, `scroll`, `gesture`, `wait`, `screenshot`, `raw`, or `close`.         |
| `RecordingSchema`      | Every frame one Tab produced, on the Proof's clock.                                                     |
| `FrameSchema`          | One frame file and the moment it appeared.                                                              |
| `DeviceKindSchema`     | `desktop` or `mobile`.                                                                                  |
| `JsonValueSchema`      | Any JSON value, as phase values are kept.                                                               |

### `laymos/skills-command`

| Export              | What it does                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| `makeSkillsCommand` | Builds a `skills` CLI subcommand that lists, prints, or installs skill folders. |

### CLI

| Command                                             | What it does                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| `laymos lint`                                       | Checks every rule, every Telling, and that Proofs are Self-contained.   |
| `laymos lint layers`                                | Checks Layer coverage and cross-Layer rules.                            |
| `laymos lint modules`                               | Checks Module coverage, boundaries, dependencies, and cycles.           |
| `laymos inspect project [--json]`                   | Summarizes the whole architecture.                                      |
| `laymos inspect layer <name> [--json]`              | Shows one Layer and its Modules.                                        |
| `laymos inspect file <path> [--recursive] [--json]` | Shows a file's Layer, Module, and dependency tree.                      |
| `laymos inspect module <path> [--json]`             | Shows a Configured Module's identity and dependencies.                  |
| `laymos stories [scope] [--concurrency <n>]`        | Runs the Proofs in a scope and prints the Story tree with each verdict. |
| `laymos skills [<name>] [--install <dir>]`          | Lists, prints, or installs the shipped agent skills.                    |

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

### Tell a Story and prove it

Each folder beneath `storiesPath` is a Story. Its `story.md` is the Telling:
a `#` title, a one-sentence pitch, then a short body that links each part by
its id. Proofs sit beside it as `*.proof.ts` files, each default-exporting one
Proof that imports only what the Project ships, `effect`, and `laymos/story`.

```ts
// stories/story.md:
//   # Resources
//
//   What you open stays open until you have checked it.
//
//   A [resource lives until Verification ends](my-app/resource-lives).
//
// stories/resource-lives.proof.ts:
import { Effect } from 'effect';
import { Proof } from 'laymos/story';

export default Proof.make({
  title: 'A resource lives until Verification ends',
  prepare: Effect.gen(function* () {
    const resource = yield* Effect.acquireRelease(
      Effect.succeed({ open: true }),
      (resource) => Effect.sync(() => (resource.open = false)),
    );
    yield* Proof.assert('the resource opened', resource.open);
    return resource;
  }),
  act: (resource) =>
    Effect.succeed({ doubled: 21 * 2, open: resource.open }).pipe(
      Effect.withSpan('double'),
    ),
  verify: (output, resource) =>
    Effect.gen(function* () {
      yield* Proof.assert('21 doubled is 42', output.doubled === 42);
      yield* Proof.assert('the resource is still open', resource.open);
      yield* Proof.budget('double', '5 millis');
    }),
});
```

How it works:

- The top Story's id is the Project's folder name (`my-app`); a sub-Story adds
  its folder path (`my-app/sync`), and a Proof adds its file name without
  `.proof.ts` (`my-app/resource-lives`). `laymos stories my-app/sync` runs that
  Story and everything beneath it.
- A Telling shows its parts in the order it first links them; unlinked Proofs
  follow by name. A missing or incomplete Telling, a link to nothing, and a
  sub-Story never linked are Telling issues that `laymos lint` reports.
- The three phases run in one scope, so what `prepare` acquires lives until
  `verify` ends. A false assertion in `prepare` makes the Proof `unprepared`; a
  false one later makes it `failed`; a phase that dies, or a timeout, makes it
  `errored`. The run is traced as `Proof` › `prepare` / `act` / `verify`.

### Prove it in the browser

A browser Proof mounts what it exercises with `page`, then performs named
Steps on Tabs. The run records every Tab at a person's pace, so the Recording
reads like someone using the app.

```ts
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';

export default Proof.browser({
  title: 'Two fingers zoom the photo',
  page: (root) => {
    root.innerHTML = '<div id="photo"></div><p id="scale">1.00</p>';
    // wire touch handlers that write the scale into #scale
  },
  prepare: (browser) => browser.open('mobile'),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.gesture('Pinch the photo open', Gesture.pinch('#photo', 2));
      return Number(yield* tab.text('#scale'));
    }),
  verify: (scale) => Proof.assert('the photo doubled', scale > 1.8),
});
```

How it works:

- One Vite dev server per run serves `/__laymos/proof/<id>`, which imports the
  Proof file and calls `page(root)`; the Project's `vite.config.*` applies.
- `desktop` is 1280×800; `mobile` is Playwright's Pixel 7. Each
  `browser.open` is a new Device with its own storage; `tab.device.open` adds a
  Tab on the same Device.
- Steps move at a person's pace: the pointer travels 0.5–0.9 s, each key takes
  about 100 ms, a tap is held 150 ms, a Gesture lasts a second unless given a
  duration, and the screen rests about 0.7 s after each Step. Browser Proofs
  time out after 90 seconds by default.
- Evidence lands in `.laymos/stories/<proof id>/`: `report.json`, one folder of
  frames per Tab, and `steps/<n>.jpg` for each Step.
