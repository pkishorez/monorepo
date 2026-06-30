---
name: programmatic-analysis
description: >
  Embed depcruise-viz in tooling instead of the CLI: call cruiseProject from
  depcruise-viz/node to cruise a package and read summary.violations /
  summary.breaches / coverage, and use the root pure helpers
  (toDependencyCruiserConfig, toVisualizationConfig, summarizeCruiseResult,
  detectCrossGroupEdges) plus the VisualizationConfig for rendering a graph.
  Load when building a DevTools view or custom analysis around depcruise-viz, or
  when "cruiseProject is not exported" / wrong-directory errors appear.
metadata:
  type: core
  library: depcruise-viz
  library_version: '0.0.1'
sources:
  - 'pkishorez/monorepo:packages/depcruise-viz/src/index.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/node.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/cruise/index.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/cli/load-config.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/README.md'
---

# depcruise-viz — Programmatic analysis

depcruise-viz exposes the same compile/cruise/analyze surface the CLI uses, so
you can build tooling (e.g. a DevTools graph) around it. The runtime cruiser
lives at the `depcruise-viz/node` entry; the pure DSL and compile/analyze
helpers live at the root entry.

## Setup

Cruise a package and read the result:

```typescript
import { cruiseProject } from 'depcruise-viz/node';

const result = await cruiseProject(process.cwd());

console.log(result.summary.violations); // layer-ordering violations
console.log(result.summary.breaches); // visibility boundary breaches
console.log(result.config); // VisualizationConfig for rendering
```

`cruiseProject(baseDir)` loads `<baseDir>/depcruise.config.ts` and resolves the
project's `rootDir` and `tsconfig.json` relative to `baseDir`.

## Core Patterns

### Compose the pure helpers

The root entry exports framework-agnostic helpers that operate on a loaded
config or cruise result — usable without running a cruise:

```typescript
import {
  toDependencyCruiserConfig,
  toVisualizationConfig,
  summarizeCruiseResult,
  detectCrossGroupEdges,
} from 'depcruise-viz';
```

### Render from the visualization config

`result.config` is a `VisualizationConfig` (stacks, layers, features, modules
with resolved visibility) ready to drive a graph renderer; `result.summary`
carries violations, breaches, coverage, conflicts, and edges.

## Common Mistakes

### HIGH Importing cruiseProject from the root entry

Wrong:

```typescript
import { cruiseProject } from 'depcruise-viz'; // not exported here
```

Correct:

```typescript
import { cruiseProject } from 'depcruise-viz/node';
```

`cruiseProject` is only exported from `depcruise-viz/node`; the root entry
exports the DSL and pure compile/analyze helpers, not the cruiser.

Source: src/index.ts; src/node.ts

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

`cruiseProject` loads `depcruise.config.ts` from the directory passed and
resolves `rootDir`/`tsconfig.json` relative to it — not the process cwd.

Source: src/cruise/index.ts:15-49; src/cli/load-config.ts:12-32

### HIGH Generating against the wrong version surface

Wrong:

```typescript
// call an export or option that does not exist in the installed version
```

Correct:

```typescript
// check the installed depcruise-viz package.json (version + exports) first
```

There are no maintained doc files — `package.json` (version + exports) is the
source of truth, refreshed each release. Agents trained on other versions
hallucinate exports or option shapes.

Source: maintainer interview; package.json

### HIGH Tension: Internal programmatic surface vs version drift

The programmatic API is powerful but evolves per release, with `package.json` as
the only source of truth. An agent that assumes a stable documented API
generates against exports or options absent in the installed version. Verify the
installed exports before generating.

See also: author-architecture-config/SKILL.md § Common Mistakes

See also: author-architecture-config/SKILL.md — the programmatic surface consumes the same ProjectConfig model the authoring skill produces.
