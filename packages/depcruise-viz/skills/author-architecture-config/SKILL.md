---
name: author-architecture-config
description: >
  Write a depcruise-viz depcruise.config.ts: declare layers with layer(),
  compose top-down stacks with layersTopDown(), isolate sub-projects with
  group(), and attach modules to features with feature()/module() and a
  visibility (private | shared | public). Load when authoring or editing a
  depcruise.config.ts, choosing layer/stack/group/feature/module granularity,
  or resolving "must have at least 2 layers", "duplicate layer name", or
  sharedWith/visibility errors.
metadata:
  type: core
  library: depcruise-viz
  library_version: '0.0.1'
sources:
  - 'pkishorez/monorepo:packages/depcruise-viz/src/authoring/layer.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/authoring/layers-top-down.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/authoring/group.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/authoring/module.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/types.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/CONTEXT.md'
  - 'pkishorez/monorepo:packages/depcruise-viz/README.md'
---

# depcruise-viz — Authoring the architecture config

A `depcruise.config.ts` describes a project's layered architecture as typed
data. depcruise-viz compiles it into dependency-cruiser rules to enforce layer
ordering and module-visibility boundaries.

Vocabulary: a **layer** is a named band of path patterns. A **stack** is one
top-down ordering of layers (upper may import lower, never above). A **group**
tags stacks into one isolated unit; layer identity is `(group, name)`. A
**feature** is a named owner an end-to-end user journey maps to. A **module** is
a self-contained folder owned by a feature with a resolved **visibility**. A
**breach** is an import that reaches another feature's/group's private internals
instead of its public surface.

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
  // cli may import core and types; core may import types; never upward.
  rules: [layersTopDown('app', [cli, core, types])],
  features: [feature('authoring', { description: 'Config DSL builders' })],
  modules: [
    module('src/authoring', { feature: 'authoring', visibility: 'public' }),
  ],
} satisfies ProjectConfig;
```

## Core Patterns

### Compose a top-down stack

`layersTopDown(name, layers)` orders layers top→bottom: the first may import any
below it; the last imports nothing. Needs at least two layers.

```typescript
const stack = layersTopDown('app', [cli, core, types]);
```

### Isolate sub-projects with a group

`group(name, stacks)` stamps a group onto each stack and returns them to spread
into `rules`. Stacks sharing a group form one isolated unit; the only sanctioned
crossing into another group is its public/shared surface.

```typescript
export default {
  rootDir: 'src',
  rules: [
    ...group('db', [dynamodbStack, sqliteStack]),
    ...group('core', [coreStack]),
  ],
} satisfies ProjectConfig;
```

### Model features as user journeys

A feature is an end-to-end journey from the user's perspective — a frontend
route, or a backend API-request path from entry to response — not a code folder.
When the same journey spans tiers, namespace it per tier.

```typescript
features: [
  feature('checkout:frontend', { description: 'Checkout route flow' }),
  feature('checkout:backend', { description: 'Checkout API request path' }),
];
```

### Attach self-contained modules with a visibility

Default visibility is `private` when a feature is set, else `public`. Passing
`sharedWith` forces `shared`. Aim for the self-contained unit — neither one
coarse module over a whole tree nor trivially over-nested folders.

```typescript
module('src/authoring', { feature: 'authoring', visibility: 'public' });
module('src/internal', { feature: 'authoring' }); // defaults to private
module('src/util', {
  feature: 'authoring',
  sharedWith: ['compile', 'analyze'],
});
```

## Common Mistakes

### HIGH Stack built with fewer than two layers

Wrong:

```typescript
layersTopDown('app', [core]); // throws: Stack "app" must have at least 2 layers
```

Correct:

```typescript
layersTopDown('app', [cli, core, types]);
```

A single-layer ordering has nothing to order, so `layersTopDown` throws.

Source: src/authoring/layers-top-down.ts:11; README Gotchas

### HIGH Reusing a layer name within the same group

Wrong:

```typescript
...group('db', [
  layersTopDown('sqlite', [layer('internal', ['src/db/sqlite']), sqliteApi]),
  layersTopDown('dynamo', [layer('internal', ['src/db/dynamo']), dynamoApi]),
]); // both 'internal' layers merge into one shared layer
```

Correct:

```typescript
layer('sqlite/internal', ['src/db/sqlite']);
layer('dynamo/internal', ['src/db/dynamo']);
```

Layer identity is `(group, name)`; reusing a name in one group merges the layers
into a single spanning node instead of keeping them distinct.

Source: src/authoring/layer.ts:3; src/types.ts:7; CONTEXT.md

### MEDIUM sharedWith with a non-shared visibility

Wrong:

```typescript
module('src/util', {
  feature: 'authoring',
  visibility: 'public',
  sharedWith: ['compile'],
}); // throws: visibility must be "shared"
```

Correct:

```typescript
module('src/util', {
  feature: 'authoring',
  sharedWith: ['compile', 'analyze'],
});
```

`sharedWith` forces `shared`; an explicit conflicting visibility throws, and
`shared` with an empty `sharedWith` also throws.

Source: src/authoring/module.ts:25-44

### HIGH Feature modeled as a code folder, not a user journey

Wrong:

```typescript
feature('utils'); // a directory, not a journey
feature('checkout'); // ambiguous across frontend and backend
```

Correct:

```typescript
feature('checkout:frontend');
feature('checkout:backend');
```

Features describe what a user does end-to-end; a folder-shaped feature produces
boundaries that don't match real ownership.

Source: maintainer interview

### MEDIUM Coarse module that mixes concerns

Wrong:

```typescript
module('src', { feature: 'app' }); // whole tree as one module
```

Correct:

```typescript
module('src/authoring', { feature: 'authoring' });
module('src/compile', { feature: 'compile' });
```

A module should map to a self-contained unit; bundling unrelated concerns under
one path defeats boundary analysis.

Source: maintainer interview

### HIGH Generating against the wrong version surface

Wrong:

```typescript
// using an export or option shape that does not exist in the installed version
```

Correct:

```typescript
// check the installed depcruise-viz package.json (version + exports) first
```

There are no maintained doc files — `package.json` is the source of truth,
refreshed each release. Agents trained on other versions hallucinate exports or
option shapes.

Source: maintainer interview; package.json

### HIGH Tension: Granularity vs maintenance overhead

Fine-grained, self-contained modules and journey-shaped features give sharper
boundaries but more config to keep in sync. Agents tend to over-coarsen to one
big module (weak enforcement) or over-nest trivially (noisy config) instead of
the self-contained unit that makes sense.

See also: enforce-boundaries/SKILL.md § Common Mistakes

See also: enforce-boundaries/SKILL.md — after authoring, run lint to verify the boundaries hold and uncovered files reach zero.
