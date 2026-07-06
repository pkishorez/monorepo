---
name: programmatic-analysis
description: >
  Embed depcruise-viz in tooling instead of the CLI. From depcruise-viz/node:
  cruiseProject (cruise a package → summary.violations / moduleViolations /
  coverage), and analyzeDeps / analyzeFiles (the data behind the deps and files
  subcommands). From the root entry: the pure helpers toDependencyCruiserConfig,
  toVisualizationConfig, summarizeCruiseResult. Load when building a DevTools
  view or custom analysis, or when "cruiseProject is not exported" / wrong-
  directory errors appear.
metadata:
  type: core
  library: depcruise-viz
  library_version: '0.0.8'
sources:
  - 'pkishorez/monorepo:packages/depcruise-viz/src/index.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/node.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/cruise/index.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/cli/load-config.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/README.md'
---

# depcruise-viz — Programmatic analysis

## The idea

depcruise-viz exposes the same compile/cruise/analyze surface the CLI uses, so
you can build tooling (a DevTools graph, a custom report) around it. The split is
by capability:

- **`depcruise-viz/node`** — anything that touches the filesystem / runs a cruise:
  `cruiseProject`, plus `analyzeDeps` and `analyzeFiles` (the data behind the
  `deps` and `files` subcommands).
- **`depcruise-viz`** (root) — the pure DSL (`edge`, `layer`, `layerGraph`,
  `module`) and pure helpers (`toDependencyCruiserConfig`, `toVisualizationConfig`,
  `summarizeCruiseResult`) that operate on a config or cruise result without
  running anything.

## Setup

Cruise a package and read the result:

```typescript
import { cruiseProject } from 'depcruise-viz/node';

const result = await cruiseProject(process.cwd());

console.log(result.summary.violations); // layer-ordering violations
console.log(result.summary.moduleOverlaps); // nested-module overlaps
console.log(result.summary.moduleViolations); // module-rule breaches
console.log(result.config); // VisualizationConfig for rendering
```

`cruiseProject(baseDir)` loads `<baseDir>/depcruise.config.ts` and resolves the
project's `rootDir` and `tsconfig.json` relative to `baseDir`.

## Core Patterns

### The `/node` analysis functions

`analyzeDeps` and `analyzeFiles` are what the CLI's `deps` and `files`
subcommands call — use them to build the same views programmatically:

```typescript
import { analyzeDeps, analyzeFiles } from 'depcruise-viz/node';

const deps = await analyzeDeps(baseDir, 'src/authoring');
deps.incoming; // FileDependencyGroup[] — who imports into the path
deps.outgoing; // FileDependencyGroup[] — what the path imports
deps.insights; // entry-point verdict, suggestedRules, config cross-reference

const files = await analyzeFiles(baseDir);
files.stats; // total / layerCovered / moduleCovered / orphaned / ...
files.problems; // orphaned / moduleGaps / ignored
files.covered; // layer -> modules -> files tree
```

### The root pure helpers

```typescript
import {
  toDependencyCruiserConfig,
  toVisualizationConfig,
  summarizeCruiseResult,
} from 'depcruise-viz';
```

These operate on a loaded `ProjectConfig` / cruise result — no filesystem access —
so they're safe to run in any environment.

### Render from the visualization config

`result.config` is a `VisualizationConfig` (layers, the layer graph, modules with
`opaque`/`rules`) ready to drive a graph renderer; `result.summary` (a
`VizSummary`) carries `violations`, `moduleOverlaps`, `moduleViolations`,
coverage, and conflicts.

## Common Mistakes

### HIGH Importing cruiseProject (or analyzeDeps/analyzeFiles) from the root entry

Wrong:

```typescript
import { cruiseProject, analyzeDeps } from 'depcruise-viz'; // not exported here
```

Correct:

```typescript
import { cruiseProject, analyzeDeps, analyzeFiles } from 'depcruise-viz/node';
```

Anything that runs a cruise lives at `depcruise-viz/node`; the root entry exports
only the DSL and the pure compile/analyze helpers.

Source: src/index.ts; src/node.ts

### HIGH Reading `summary.breaches` — that field is gone

Wrong:

```typescript
result.summary.breaches; // undefined — the visibility/breach model was retired
```

Correct:

```typescript
result.summary.violations; // layer-graph violations
result.summary.moduleViolations; // module-rule breaches
result.summary.moduleOverlaps; // nested-module overlaps
```

Likewise `detectCrossGroupEdges` / `assertGroupIsolation` no longer exist —
groups were retired.

Source: src/types.ts (VizSummary); src/index.ts

### MEDIUM Pointing cruiseProject at the wrong directory

Wrong:

```typescript
// running from the repo root while the config lives in a package
await cruiseProject(process.cwd());
```

Correct:

```typescript
await cruiseProject(packageDirContainingConfig);
```

`cruiseProject` loads `depcruise.config.ts` from the directory passed and resolves
`rootDir`/`tsconfig.json` relative to it — not the process cwd.

Source: src/cruise/index.ts; src/cli/load-config.ts

### HIGH Generating against the wrong version surface

There are no maintained doc files — the installed `package.json` (version +
exports) is the source of truth, refreshed each release. Verify the installed
exports before generating, so you don't call an export or option that the version
in use doesn't have.

Source: package.json

See also: author-architecture-config/SKILL.md — the programmatic surface consumes
the same `ProjectConfig` model the authoring skill produces.
