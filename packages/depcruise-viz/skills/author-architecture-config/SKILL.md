---
name: author-architecture-config
description: >
  Write a depcruise-viz depcruise.config.ts: declare layers with layer(),
  compose top-down stacks with layersTopDown(), and model feature trees with
  feature(root, modules) and module(path, { barrel? }). Load when authoring or
  editing a depcruise.config.ts, choosing layer/stack/feature/module
  granularity, or resolving "must have at least 2 layers", "duplicate layer
  name", "not a declared module name", or closure-violation errors.
metadata:
  type: core
  library: depcruise-viz
  library_version: '0.0.4'
sources:
  - 'pkishorez/monorepo:packages/depcruise-viz/src/authoring/layer.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/authoring/layers-top-down.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/authoring/feature.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/authoring/module.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/types.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/CONTEXT.md'
  - 'pkishorez/monorepo:packages/depcruise-viz/README.md'
---

# depcruise-viz — Authoring the architecture config

A `depcruise.config.ts` describes a project's layered architecture as typed
data. depcruise-viz compiles it into dependency-cruiser rules to enforce layer
ordering and feature-tree closure.

Vocabulary: a **layer** is a named band of path patterns. A **stack** is one
top-down ordering of layers (upper may import lower, never above). A **module**
is a named unit of code living in exactly one layer — it carries only
`(name, layer, path)` plus an optional `barrel` flag; no owner, no visibility.
A **feature** is a declared rooted tree: an explicit `root` module name plus a
list of member module names, one tree per user-facing entry point. A **shared
module** is one named by ≥2 features — sharing is emergent, not configured.
A **barrel** is a module flagged `barrel: true`; its out-edges are exempt from
closure and coverage.

## Setup

Create `depcruise.config.ts` at the package root and default-export a
`ProjectConfig`:

```typescript
import {
  feature,
  layer,
  layersTopDown,
  module,
  type ProjectConfig,
} from 'depcruise-viz';

const cli = layer('cli', ['src/cli'], { description: 'CLI entry + wiring' });
const core = layer('core', ['src/authoring', 'src/compile', 'src/analyze'], {
  description: 'Pure DSL, compilation, analysis',
});
const types = layer('types', ['src/types.ts'], { description: 'Shared types' });

export default {
  rootDir: 'src',
  ignore: ['src/index.ts'],
  rules: [layersTopDown('app', [cli, core, types])],
  features: [
    feature('authoring', {
      root: 'authoring',
      modules: ['authoring', 'types.ts'],
      description: 'Config DSL builders',
    }),
  ],
  modules: [
    module('src/authoring'),
    module('src/types.ts'),
    module('src/cli', { barrel: true }),
  ],
} satisfies ProjectConfig;
```

## Core Patterns

### Compose a top-down stack

`layersTopDown(name, layers)` orders layers top→bottom: the first may import
any below it; the last imports nothing. Needs at least two layers.

```typescript
const stack = layersTopDown('app', [cli, core, types]);
```

### Declare a module

`module(path, { barrel? })` registers a folder (or file) as a named unit in
exactly one layer. The **module name** is derived from the path: the path tail
below the layer's root path. When the module path equals the layer path (e.g. a
single-file layer like `src/types.ts`), the name falls back to the basename
(`types.ts`). Use that exact string in feature `root` and `modules` arrays.

```typescript
module('src/authoring'); // name: "authoring"
module('src/types.ts'); // name: "types.ts"  (basename fallback)
module('src/cli', { barrel: true }); // name: "cli", exempt from closure
```

A **barrel** (`barrel: true`) is a re-export or fan-out point whose out-edges
are exempt from closure and coverage — use it for wiring layers (CLI entry,
index re-exports, DI containers) that legitimately reach many downstream modules
without belonging to a single feature.

### Declare a feature tree

`feature(name, { root, modules, description? })` declares a vertical slice. The
`root` is the entry module name (must be in `modules`). `modules` is the full
member list — every module this feature's import cone spans, down to shared
leaves. Edges are **derived** from the real import graph restricted to the
member set; you don't declare edges explicitly.

```typescript
feature('authoring', {
  root: 'authoring',
  modules: ['authoring', 'types.ts'],
  description: 'Public config DSL builders',
});
```

### One feature per user-facing entry point

A feature is an end-to-end vertical slice from one entry point. Model **what
the user is actually doing**, one feature per real entry point, not one per
handler family. When the same journey spans tiers, namespace it per tier
(`:frontend`, `:backend`).

### Shared modules are emergent

A module named in ≥2 feature trees is automatically shared — no marker, no
`sharedWith`. Identify which modules are shared by reading the real import graph
(run `pnpm lint:depcruise` and note unclaimed edges; add the module to every
feature that reaches it). The closure rule relaxes at shared modules: each
referencing feature accounts only for the edges to its own declared members.

```typescript
// types.ts is shared: named by authoring, compile, and analyze.
feature('authoring', { root: 'authoring', modules: ['authoring', 'types.ts'] });
feature('compile', { root: 'compile', modules: ['compile', 'types.ts'] });
feature('analyze', { root: 'analyze', modules: ['analyze', 'types.ts'] });
module('src/types.ts'); // no marker — the fact that three features name it IS the sharing
```

### TDD loop for a config

1. Declare modules (all folders/files you want to track).
2. Declare features with `root` + `modules` (start with just the root).
3. Run `pnpm lint:depcruise`.
4. For each unclaimed-edge violation, add the target module to every feature
   that reaches it, or flag the source module as `barrel: true`.
5. Repeat until exit 0.

### Worked example: depcruise-viz dogfooding itself

```typescript
const cli = layer('cli', ['src/cli', 'src/cruise'], {
  description: 'CLI entry, wiring, cruise orchestration',
});
const core = layer('core', ['src/authoring', 'src/compile', 'src/analyze'], {
  description: 'Pure DSL, compilation, analysis',
});
const types = layer('types', ['src/types.ts'], { description: 'Shared types' });

export default {
  rootDir: 'src',
  ignore: ['src/index.ts', 'src/node.ts'],
  rules: [layersTopDown('depcruise-viz', [cli, core, types])],
  features: [
    feature('authoring', {
      root: 'authoring',
      modules: ['authoring', 'types.ts'],
    }),
    feature('compile', { root: 'compile', modules: ['compile', 'types.ts'] }),
    feature('analyze', { root: 'analyze', modules: ['analyze', 'types.ts'] }),
  ],
  modules: [
    module('src/authoring'),
    module('src/compile'),
    module('src/analyze'),
    module('src/types.ts'), // shared by all three features
    module('src/cli', { barrel: true }), // wiring barrel — CLI entry
    module('src/cruise', { barrel: true }), // wiring barrel — cruise orchestration
  ],
};
```

`types.ts` is shared (named by three features). `cli` and `cruise` are barrels
whose cross-cutting imports are exempt from closure.

## Common Mistakes

### HIGH Module name wrong in feature tree

Wrong:

```typescript
module('src/types.ts');
feature('authoring', { root: 'authoring', modules: ['authoring', 'types'] });
// Error: member "types" is not a declared module name
```

Correct:

```typescript
module('src/types.ts');
feature('authoring', { root: 'authoring', modules: ['authoring', 'types.ts'] });
// "types.ts" is the basename fallback when module path == layer path
```

When a module is declared at its layer's own path, the name is the **basename**
(including extension). Use that exact string in `root` and `modules`.

Source: src/compile/to-visualization-config.ts — `deriveModuleName`

### HIGH Stack built with fewer than two layers

Wrong:

```typescript
layersTopDown('app', [core]); // throws: Stack "app" must have at least 2 layers
```

Correct:

```typescript
layersTopDown('app', [cli, core, types]);
```

Source: src/authoring/layers-top-down.ts

### HIGH Reusing a layer name within the same stack

Wrong:

```typescript
layersTopDown('app', [
  layer('internal', ['src/a']),
  layer('internal', ['src/b']), // merges into one layer
]);
```

Correct:

```typescript
layer('a/internal', ['src/a']);
layer('b/internal', ['src/b']);
```

Layer identity is `name`; reusing a name merges the layers into a single
spanning node.

Source: src/authoring/layer.ts; CONTEXT.md

### HIGH Adding visibility or sharedWith — those fields no longer exist

Wrong:

```typescript
module('src/util', { feature: 'authoring', sharedWith: ['compile'] });
module('src/types', { visibility: 'public' });
```

Correct:

```typescript
// Declare the module; name it in every feature that reaches it.
module('src/util');
feature('authoring', { root: 'authoring', modules: ['authoring', 'util'] });
feature('compile', { root: 'compile', modules: ['compile', 'util'] });
```

Sharing is emergent — no marker on the module, no `sharedWith`, no `visibility`.

Source: ADR 0001; CONTEXT.md

### HIGH Feature modeled as a code folder, not a user entry point

Wrong:

```typescript
feature('utils', { root: 'utils', modules: ['utils'] }); // a directory, not a journey
```

Correct:

```typescript
feature('checkout:frontend', { root: 'checkout-page', modules: [...] });
feature('checkout:backend',  { root: 'cart-handler',  modules: [...] });
```

Features describe user-facing entry points. A folder-shaped feature produces
boundaries that don't match real ownership.

Source: maintainer interview; CONTEXT.md

### HIGH Generating against the wrong version surface

Wrong:

```typescript
// using an export or option shape that does not exist in the installed version
```

Correct:

```typescript
// check the installed depcruise-viz package.json (version + exports) first
```

There are no maintained doc files — `package.json` is the source of truth.

Source: package.json

### HIGH Tension: Granularity vs maintenance overhead

Fine-grained modules and per-entry-point features give sharper closure but more
config to keep in sync. Don't over-coarsen (one big module = weak enforcement)
or over-nest trivially. Match module granularity to real responsibility units.

See also: enforce-boundaries/SKILL.md — after authoring, run lint to verify closure holds and all edges are claimed.
