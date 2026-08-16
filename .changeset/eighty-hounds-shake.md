---
'laymos': patch
---

Rebuild Laymos around a JSON config, a unified Layer and Module analysis, and
executable Stories.

**Breaking:** declare architecture in `laymos.config.json` instead of
`laymos.config.ts`; `defineConfig` is removed. The config carries `sourceRoots`,
`ignoredPaths`, `storiesPath`, `layers`, `modules`, and `layerGraphs`, and every
project-relative path resolves from the config file's own directory. `--config`
defaults to `./laymos.config.json`. The package ships `schema.json`, so
`"$schema": "https://unpkg.com/laymos/schema.json"` gives editors autocomplete
and validation with no package dependency.

Configure Modules by canonical project-relative file or directory. `kind` is
`"normal" | "shared" | "entry"` and defaults to `normal` when omitted.
`subpaths` lists exact directories whose `index.ts` becomes an extra public door
for tree shaking; Entry and File Modules cannot declare them. `layerGraphs`
groups named rule sets that map a layer id to the layer ids it may directly
depend on — default-deny, transitive across all graphs combined, and required to
stay acyclic. A layer with no outgoing rule is a valid leaf.

**Breaking:** the story authoring API is replaced. `story`, `storyGroup`,
`step`, `decision`, and `functionBlock` are gone. `laymos/story` now exports
`Story` (`Story.make`, `Story.question`, `Story.group`, `Story.assert`,
`Story.trace`, `Story.flow`), `StoryContext`, `isStory`, and `isStoryGroup`. A
Story is a title plus questions, each carrying an `answer` and an Effect
`proof`; `Story.trace` and `Story.flow` attach recorded Effect traces and flows
to the report.

**Breaking:** the `laymos/node` and `laymos/report` subpaths are removed. Root
`laymos` exports `analyzeProject`, `loadModuleSource`, `inspectProject`,
`inspectLayer`, `inspectFile`, `inspectModule`, `getStoryTree`, `planStories`,
and `runStories`, plus `ConfigError`, `CruiseError`, `StoriesError`,
`InspectionTargetNotFound`, `ModuleInspectionCycle`, `ModuleSourceNotFound`, and
`ModuleSourceReadError`. Browser-safe contracts move to the new
`laymos/architecture-analysis-schema` (`ArchitectureAnalysisSchema`,
`ModuleSourceSnapshotSchema`) and `laymos/story/schema` (`StoryReportSchema`,
`StoryTreeSchema`, `CapturedTraceSchema`, `RecordedFlowSchema`,
`slugifyQuestion`).

The command tree is `lint`, `inspect`, and `stories`:

- `laymos lint` checks every rule. `lint layers` checks layer coverage,
  configured Module presence, and dependencies. `lint modules` checks coverage,
  entry points, dependencies, public boundaries, cycles, and unused Shared
  Modules, and prints kind totals.
- `laymos inspect project | layer <name> | file <path> [--recursive] | module <path>`,
  each with `--json` for stable tool output. `inspect module` prints the
  configured kind, source shape, and observed kind separately, along with public
  entry points and a dependency tree; it aborts on a cycle and points at
  `lint modules`.
- `laymos stories [--concurrency|-c <n>]` (default 16) runs the whole Story tree
  concurrently with a live TTY progress line and a per-question verdict tree.

Exit codes are `1` for violations and `2` for an invalid config or a failed
analysis. `bin` is now `bin/laymos.mjs` (was `dist/cli/cli.js`), so the binary
links without a prior build.

Dependency extraction is rebuilt on `oxc-parser` and `oxc-resolver` behind a
`file-cruiser` service; `skott` and `jiti` are gone and `tsx` loads story files.
`@pkishorez/effect-tracer` moves to `dependencies` — `laymos/story` imports it
at runtime, so declaring it as a devDependency shipped a broken install. The
`effect` peer range moves to `^4.0.0-beta.102`.
