# depcruise-viz

Author your project's layered architecture as a typed config, then enforce its boundaries — built on [dependency-cruiser](https://github.com/sverweij/dependency-cruiser).

You describe layers and feature trees in a `depcruise.config.ts`; `depcruise-viz` compiles that into dependency-cruiser rules, cruises the codebase, and reports layer violations and feature-closure violations. The same compiled model also produces a visualization config for rendering the graph.

> If you use an AI agent, run `npx @tanstack/intent@latest install` to load this package's skills into your agent config.

## Prerequisites

- **Node.js** with ESM support
- A **TypeScript** project (a `tsconfig.json` at the package root is picked up automatically)
- Familiarity with [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) concepts is helpful but not required

## Installation

```bash
npm install depcruise-viz
```

## Getting Started

Create a `depcruise.config.ts` at your package root that exports a `ProjectConfig`:

```typescript
import {
  feature,
  layer,
  layersTopDown,
  module,
  type ProjectConfig,
} from 'depcruise-viz';

const cli = layer('cli', ['src/cli'], {
  description: 'CLI entry, command wiring, config loading',
});

const core = layer('core', ['src/authoring', 'src/compile', 'src/analyze'], {
  description: 'Pure DSL and analysis',
});

const types = layer('types', ['src/types.ts'], {
  description: 'Shared type foundation',
});

export default {
  rootDir: 'src',
  ignore: ['src/index.ts'],
  // Top-down: cli may import core and types; core may import types; never upward.
  rules: [layersTopDown('my-project', [cli, core, types])],
  features: [
    feature('authoring', {
      root: 'authoring',
      modules: ['authoring', 'types.ts'],
      description: 'Public config DSL builders',
    }),
  ],
  modules: [
    module('src/authoring'),
    module('src/types.ts'),
    module('src/cli', { barrel: true }),
  ],
} satisfies ProjectConfig;
```

Then lint your project — this fails (non-zero exit) on any layer violation or feature-closure violation:

```bash
npx depcruise-viz lint
```

## Concepts

| Term              | Meaning                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| **Stack**         | One top-down layering — an ordered set of layers where an upper layer may import those below, never above |
| **Layer**         | A named band of path patterns within a stack                                                              |
| **Module**        | A named unit of code in exactly one layer — carries `(name, layer, path)` and an optional `barrel` flag   |
| **Feature**       | A declared rooted tree of module names: a single `root` plus a member list                                |
| **Shared module** | A module named by ≥2 features — emergent, no marker needed                                                |
| **Barrel**        | A module flagged `barrel: true`; its out-edges are exempt from closure and coverage                       |

## Authoring API

| Function          | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `layer()`         | Declare a named band of path patterns                             |
| `layersTopDown()` | Compose layers into a top-down stack (upper imports lower)        |
| `feature()`       | Declare a named feature tree: `root` module + member list         |
| `module()`        | Declare a folder/file as a module, with an optional `barrel` flag |

---

### layer

A named band of one or more path patterns within a stack. Layers whose paths overlap are reported as conflicts, since a file would match both.

```typescript
const core = layer('core', ['src/authoring', 'src/compile'], {
  description: 'Pure DSL and compilation',
});
```

---

### layersTopDown

Composes layers into a single top-down stack. The first layer sits on top and may import any layer below it; the bottom layer may import nothing. Requires at least two layers.

```typescript
// cli → core → types (downward imports only)
const stack = layersTopDown('my-project', [cli, core, types]);
```

---

### feature

Declares a named feature as a rooted tree. `root` is the entry module name (must be in `modules`). `modules` is the full member list spanning all layers the feature touches. Edges between members are derived from the real import graph.

```typescript
feature('authoring', {
  root: 'authoring',
  modules: ['authoring', 'types.ts'],
  description: 'Public config DSL builders',
});
```

One feature per user-facing entry point (one route, one API endpoint, one CLI command). When the same journey spans tiers, namespace it: `checkout:frontend`, `checkout:backend`.

A module named in ≥2 features is automatically **shared** — no marker, no extra config. Closure relaxes at shared modules: each feature traces only its own member edges.

---

### module

Declares a folder (or file) as a named unit in exactly one layer. The module **name** is the path tail below the layer's root path. When the module path equals the layer path (e.g. a single-file layer `src/types.ts`), the name falls back to the basename (`types.ts`). Use that exact string in feature `root` and `modules` arrays.

```typescript
module('src/authoring'); // name: "authoring"
module('src/types.ts'); // name: "types.ts"  (basename fallback)
module('src/cli', { barrel: true }); // name: "cli", out-edges exempt from closure
```

A **barrel** (`barrel: true`) is a re-export or fan-out point — e.g. a CLI entry that wires together multiple features, or an index that re-exports many units. A barrel's out-edges are not required to be claimed by any feature.

## Feature Closure

The lint contract over feature trees:

1. A non-barrel module referenced by exactly one feature must have all its real out-edges as members of that feature — it cannot reach outside.
2. At a shared module (named by ≥2 features) or a barrel, closure relaxes.
3. Every real module→module import edge must be claimed by at least one feature, except edges leaving a barrel. An unclaimed edge surfaces as a violation.

**TDD loop for a config:**

1. Declare modules.
2. Declare features (start with just `root`).
3. Run `pnpm lint:depcruise`.
4. For each `unclaimed-edge` violation, add the target module to every feature that reaches it, or flag the source as `barrel: true`.
5. Repeat until exit 0.

## Programmatic Use

The `./node` entry cruises a package and returns the compiled config plus a summary of violations and coverage:

```typescript
import { cruiseProject } from 'depcruise-viz/node';

const result = await cruiseProject(process.cwd());

console.log(result.summary.violations); // layer + closure violations
console.log(result.config); // visualization config for rendering
```

The pure compilation and analysis helpers are also exported from the root entry:

```typescript
import {
  toDependencyCruiserConfig,
  toVisualizationConfig,
  summarizeCruiseResult,
  detectCrossGroupEdges,
} from 'depcruise-viz';
```

## CLI

| Command | Description                                                                 |
| ------- | --------------------------------------------------------------------------- |
| `lint`  | Cruise the current directory and enforce layer ordering and feature closure |

```bash
depcruise-viz lint
```

`lint` reads `depcruise.config.ts` from the current working directory, prints layer/module/feature coverage to stdout, and writes any violations to stderr. It exits non-zero when violations are found, so it drops into CI and `package.json` scripts directly:

```json
{
  "scripts": {
    "lint:depcruise": "depcruise-viz lint"
  }
}
```

## Gotchas

- **Config must live at the package root**: both the CLI and `cruiseProject` load `depcruise.config.ts` from the target directory and resolve `rootDir`/`tsconfig.json` relative to it — not relative to the process's cwd.
- **Coverage gaps are warnings, not failures**: files outside every layer or module are reported in yellow but never fail the lint. Only violations set a non-zero exit code.
- **Module names include the extension when the module path equals the layer path**: a single-file layer like `src/types.ts` gives modules the name `types.ts`, not `types`. Use that exact string in feature `root` and `modules` arrays.
- **A stack needs at least two layers**: `layersTopDown` throws otherwise — a single-layer ordering has nothing to order.
- **No visibility or sharedWith**: those fields are gone. Sharing is emergent — name a module in ≥2 feature trees and it becomes shared automatically.

## License

MIT
