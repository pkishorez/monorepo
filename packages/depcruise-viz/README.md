# depcruise-viz

Author your project's layered architecture as a typed config, then enforce its boundaries — built on [dependency-cruiser](https://github.com/sverweij/dependency-cruiser).

You describe layers, features, and module visibility in a `depcruise.config.ts`; `depcruise-viz` compiles that into dependency-cruiser rules, cruises the codebase, and reports layer violations and boundary breaches. The same compiled model also produces a visualization config for rendering the graph.

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
  description: 'Pure DSL, compilation and analysis',
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
    feature('authoring', { description: 'Public config DSL builders' }),
  ],
  modules: [
    module('src/authoring', { feature: 'authoring', visibility: 'public' }),
  ],
} satisfies ProjectConfig;
```

Then lint your project — this fails (non-zero exit) on any layer violation or boundary breach:

```bash
npx depcruise-viz lint
```

## Concepts

| Term        | Meaning                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| **Stack**   | One top-down layering — an ordered set of layers where an upper layer may import those below, never above |
| **Layer**   | A named band of path patterns within a stack; identity is `(group, name)`                                 |
| **Group**   | A tag above stacks; stacks sharing a group form one isolated, bounded unit                                |
| **Feature** | A named owner that modules attach to, with a description                                                  |
| **Module**  | A folder owned by a feature with a resolved visibility (`public` / `private` / `shared`)                  |
| **Breach**  | An import that reaches another feature's or group's **private** internals instead of its public surface   |

## Authoring API

| Function          | Description                                                           |
| ----------------- | --------------------------------------------------------------------- |
| `layer()`         | Declare a named band of path patterns                                 |
| `layersTopDown()` | Compose layers into a top-down stack (upper imports lower)            |
| `group()`         | Stamp a group name onto stacks so they render and isolate as one unit |
| `feature()`       | Declare a named feature that modules belong to                        |
| `module()`        | Declare a folder owned by a feature with a visibility                 |

---

### layer

A named band of one or more path patterns within a stack. Its name is its identity within its group. Layers whose paths overlap (one nested under another) are reported as conflicts, since a file would match both.

```typescript
const core = layer('core', ['src/authoring', 'src/compile'], {
  description: 'Pure DSL and compilation',
});
```

---

### layersTopDown

Composes layers into a single top-down stack. The first layer sits on top and may import any layer below it; the bottom layer may import nothing. Requires at least two layers and rejects duplicate layer names with differing definitions.

```typescript
// cli → core → types (downward imports only)
const stack = layersTopDown('my-project', [cli, core, types]);
```

---

### group

Stamps a group name onto each stack and returns them, ready to spread into `rules`. Stacks sharing a group render inside one labeled region and form an isolated unit — layer identity is namespaced per group, so the same layer name in another group is a distinct layer. Groups do not nest.

```typescript
export default {
  rootDir: 'src',
  rules: [
    ...group('db', [dynamodbStack, sqliteStack]),
    ...group('core', [coreStack]),
  ],
} satisfies ProjectConfig;
```

---

### feature

Declares a named feature with an optional description. Modules attach to a feature by name.

```typescript
const authoring = feature('authoring', {
  description: 'Public config DSL builders',
});
```

---

### module

Declares a folder owned by an optional feature with a resolved visibility. Default visibility is `private` when a feature is set, otherwise `public`. Passing `sharedWith` forces `shared` and requires a non-empty list of feature names.

```typescript
module('src/authoring', { feature: 'authoring', visibility: 'public' });
module('src/internal', { feature: 'authoring' }); // defaults to private
module('src/util', {
  feature: 'authoring',
  sharedWith: ['compile', 'analyze'],
});
```

## Programmatic Use

The `./node` entry cruises a package and returns the compiled config plus a summary of violations, breaches, and coverage — useful for building tooling around the analysis (e.g. a DevTools server).

```typescript
import { cruiseProject } from 'depcruise-viz/node';

const result = await cruiseProject(process.cwd());

console.log(result.summary.violations); // layer-ordering violations
console.log(result.summary.breaches); // visibility boundary breaches
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

| Command | Description                                                                   |
| ------- | ----------------------------------------------------------------------------- |
| `lint`  | Cruise the current directory and enforce layer ordering and module boundaries |

```bash
depcruise-viz lint
```

`lint` reads `depcruise.config.ts` from the current working directory, prints layer/module coverage to stdout, and writes any violations and breaches to stderr. It exits non-zero when violations or breaches are found, so it drops into CI and `package.json` scripts directly:

```json
{
  "scripts": {
    "lint:depcruise": "depcruise-viz lint"
  }
}
```

## Gotchas

- **Config must live at the package root**: both the CLI and `cruiseProject` load `depcruise.config.ts` from the target directory and resolve `rootDir`/`tsconfig.json` relative to it — not relative to the process's cwd.
- **Coverage gaps are warnings, not failures**: files outside every layer or module are reported in yellow but never fail the lint. Only violations and breaches set a non-zero exit code.
- **Layer names are scoped to their group**: reusing a name across stacks in the **same** group merges them into one shared layer. To keep them separate, namespace the name (e.g. `sqlite/internal`, `dynamodb/internal`). The same name in a different group is always distinct.
- **A stack needs at least two layers**: `layersTopDown` throws otherwise — a single-layer ordering has nothing to order.
- **Cross-group imports must hit a public/shared surface**: reaching another group's private internals fails analysis at author time.

## License

MIT
