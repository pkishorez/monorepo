---
name: author-architecture-config
description: >
  Write a depcruise-viz depcruise.config.ts: sort files into layer()s, wire the
  allowed import directions with layerGraph() + edge() (a DAG — siblings are
  independent, reachability is transitive), and name the units inside as
  module()s with optional opaque and rules. Load when authoring or editing a
  depcruise.config.ts, choosing layer/module granularity, deciding edges, or
  resolving "Layer ordering cycle detected", self-edge, or module-rule
  contradiction errors.
metadata:
  type: core
  library: depcruise-viz
  library_version: '0.0.8'
sources:
  - 'pkishorez/monorepo:packages/depcruise-viz/src/authoring/layer.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/authoring/layer-graph.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/authoring/module.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/types.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/CONTEXT.md'
  - 'pkishorez/monorepo:packages/depcruise-viz/README.md'
---

# depcruise-viz — Authoring the architecture config

## The idea

Every package has an _implicit_ architecture: some files belong at the bottom
(shared types, helpers), some in the middle (domain logic), some at the top
(entry points, wiring), and imports are supposed to flow one way. But nothing
stops a helper from reaching up into a route and quietly tangling the graph.

A `depcruise.config.ts` writes that intended architecture down as typed data, so
`depcruise-viz` can check the real import graph against it. You describe two
things:

- **Layers** — you sort files into named bands, then draw a **layer graph**: a
  DAG whose edges say who may import whom. Anything the graph doesn't allow is a
  violation.
- **Modules** — you name the meaningful units inside those layers, so coverage
  and finer per-module rules have something to attach to.

The job is done when every file is accounted for and the real imports break none
of your rules: **total coverage, zero violations**.

## Vocabulary

- **Layer** — a named band of path patterns (`layer(name, paths)`). The name is
  identity; reusing a name merges the layers into one spanning node.
- **Layer graph** — a DAG built with `layerGraph(name, [edge(a, b), …])`, where
  `edge(a, b)` means "a may import b". **Reachability is transitive**: A may
  import B iff a directed path A→…→B exists. Layers with no path between them are
  **siblings** — independent, forbidden to import each other in either direction.
  A plain top-down stack is just a chain of edges.
- **Module** — one unit of code (`module(path, …)`) living in exactly one layer.
  Its name is derived from the path tail below the layer root (or the basename
  incl. extension when the path equals the layer path). Modules are mutually
  exclusive — never nested.
- **Opaque module** — `module(path, { opaque: true })`: a wiring/barrel point
  (CLI entry, DI container). Its files still count for coverage, but what it
  imports is left unanalyzed.
- **Module rules** — `module(path, { rules })`: enforced constraints on a
  module's edges (`root` / `leaf` / `onlyImports` / `onlyImportedBy`). Opt-in.

## Setup

Create `depcruise.config.ts` at the package root and default-export a
`ProjectConfig`:

```typescript
import {
  edge,
  layer,
  layerGraph,
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
  rules: [layerGraph('app', [edge(cli, [core, types]), edge(core, types)])],
  modules: [
    module('src/authoring'),
    module('src/types.ts', { rules: { leaf: true } }),
    module('src/cli', { opaque: true }),
  ],
} satisfies ProjectConfig;
```

If you're starting from scratch, begin with just `{ rootDir: 'src' }` — that
empty map is enough to run `depcruise-viz deps`/`files`/`lint` — then grow it.

## Core Patterns

### Learn the shape with `deps` before you write

Don't guess the layering. For each folder under `src/`, run
`depcruise-viz deps <path>` and read its edges: who imports it tells you how
_low_ it belongs; what it imports tells you how _high_. The `insights` block also
gives an entry-point/barrel verdict (a hint at `opaque`) and a _draft_ set of
suggested module rules. Band the folders from what you learn, then draw the
sparsest edge set that honestly reflects intent.

### Draw the layer graph

`layerGraph(name, [edges])` is a DAG, not just a top-down stack. `edge(a, b)`
means "a may import b"; `edge(a, [b, c])` fans out to one edge per target.
Reachability is transitive, so you never write skip edges (`edge(a, c)` is
redundant when `edge(a, b)` + `edge(b, c)` exist).

```typescript
// A stack is a chain:
layerGraph('app', [edge(cli, core), edge(core, types)]);

// A diamond — a shape a flat stack can't express — uses siblings:
layerGraph('web', [
  edge(server, [entrypoints, routes]), // entrypoints & routes are siblings
  edge(entrypoints, components),
  edge(routes, components),
  edge(components, lib),
]);
```

Siblings are the default: no edge between two layers = independent, forbidden
both ways. Add an edge only where a dependency is architecturally legitimate.

### Declare a module

`module(path, { name?, opaque?, rules? })` registers a folder or file as a named
unit in exactly one layer. The name is derived from the path tail below the
layer root; when the module path equals the layer path (a single-file layer like
`src/types.ts`), the name falls back to the basename incl. extension. Modules
must be mutually exclusive — never nest one path inside another.

```typescript
module('src/authoring'); // name: "authoring"
module('src/types.ts'); // name: "types.ts" (basename fallback)
module('src/cli', { opaque: true }); // wiring barrel — out-edges unanalyzed
```

### Add rules only when intent is clear

`rules: { root?, leaf?, onlyImports?, onlyImportedBy? }` enforce a module's
edges: `root` = nobody may import it; `leaf` = it may import no module;
`onlyImports` / `onlyImportedBy` = allow-lists naming other declared modules **by
path**. Rules run against the raw import graph, so they bite even on an `opaque`
module. They encode intent only the owner knows — prefer the user declares them,
and never add or loosen one just to silence a violation.

```typescript
module('src/types.ts', { rules: { leaf: true } }); // pure types import nothing
module('src/components/charts', {
  rules: { onlyImportedBy: ['src/routes/devtools'] }, // reachable only from there
});
```

### The fix loop

1. Start with modules for the folders/files you want to track.
2. Run `pnpm lint:depcruise` (the gate) and `depcruise-viz files` (inventory).
3. Add layers/modules for orphaned + module-gap files; reverse violating imports
   (or, rarely, add a deliberate edge); un-nest overlapping modules.
4. Repeat until `files` shows full coverage and `lint` prints
   `No violations found.`

## Common Mistakes

### HIGH Using retired functions — feature / group / layersTopDown / visibility

Wrong:

```typescript
import { feature, group, layersTopDown } from 'depcruise-viz'; // not exported
module('src/util', { sharedWith: ['compile'], visibility: 'public' }); // no such options
module('src/cli', { barrel: true }); // renamed
```

Correct:

```typescript
import { edge, layer, layerGraph, module } from 'depcruise-viz';
layerGraph('app', [edge(cli, core), edge(core, types)]); // was layersTopDown
module('src/cli', { opaque: true }); // was barrel: true
```

`feature`, `group`, `sharedWith`, `visibility`, `barrel`, and `layersTopDown`
are all retired. Model dependency direction with `layerGraph` + `edge`, and use
`opaque` / `rules` on modules. There is no feature tree and no visibility system.

Source: src/authoring/index.ts (exports); src/types.ts

### HIGH Reusing a layer name

Wrong:

```typescript
layer('internal', ['src/a']);
layer('internal', ['src/b']); // merges into one spanning layer
```

Correct:

```typescript
layer('a-internal', ['src/a']);
layer('b-internal', ['src/b']);
```

Layer identity is the name; reusing it merges the paths into a single node.

Source: src/authoring/layer.ts; CONTEXT.md

### MEDIUM Self-edge or redundant skip edge

Wrong:

```typescript
edge(core, core); // throws: self-edge
layerGraph('app', [edge(cli, core), edge(core, types), edge(cli, types)]);
// edge(cli, types) is redundant — cli already reaches types transitively
```

Correct:

```typescript
layerGraph('app', [edge(cli, core), edge(core, types)]);
```

Source: src/authoring/layer-graph.ts

### MEDIUM Module-rule contradiction

Wrong:

```typescript
module('src/types.ts', { rules: { root: true, onlyImportedBy: ['src/cli'] } });
// throws: "root" contradicts "onlyImportedBy"
```

Correct:

```typescript
module('src/types.ts', { rules: { leaf: true } });
// root = onlyImportedBy: []; leaf = onlyImports: []; don't combine with the long form
```

Source: src/authoring/module.ts (validateRules)

### MEDIUM Coarse module that mixes concerns

Wrong:

```typescript
module('src', {}); // the whole tree as one module — enforces nothing
```

Correct:

```typescript
module('src/authoring');
module('src/compile');
```

Match module granularity to real, self-contained responsibility units. One giant
module barely enforces anything; trivially small ones are just churn.

Source: maintainer interview; CONTEXT.md

### HIGH Generating against the wrong version surface

There are no maintained doc files — the installed `package.json` (version +
exports) is the source of truth, refreshed each release. Check it before
authoring so you don't reach for a retired symbol or option shape.

Source: package.json

See also: enforce-boundaries/SKILL.md — after authoring, run lint to verify the
boundaries hold and coverage reaches zero uncovered files.
