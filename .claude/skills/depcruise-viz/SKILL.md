---
name: depcruise-viz
description: Sets up or updates dependency-cruiser-viz in a monorepo package. On first run, installs the dep, adds scripts, analyzes the codebase, and generates depcruise.config.ts. On subsequent runs, re-analyzes to suggest config updates — new layers, features, coverage gaps. Use when the user wants to set up or update dependency layer validation, runs /depcruise-viz, or asks to add/modify depcruise-viz config in a package.
disable-model-invocation: true
---

# depcruise-viz

User-invoked only. Run inside a target package directory under `packages/` or `apps/`. Bail with a clear message if run from the monorepo root or anywhere else.

## Mode detection

1. Verify `package.json` exists in the current directory. If not, abort: "no package.json found — run this from a package root."
2. Check if `depcruise.config.ts` exists:
   - **No** → run in **Setup mode** (full setup from scratch)
   - **Yes** → run in **Update mode** (analyze and suggest changes)

If the user provided specific intent (e.g. "add features", "update layers"), focus on that area in update mode.

---

## Path selection policy

Layer paths should be directory-first. Prefer mapping an entire folder that represents an architectural boundary, such as `src/routes`, `src/services`, `src/domain`, or `src/lib`.

Use file paths in layer definitions only as explicit exceptions, and make the reason clear in the recommendation. Good exceptions include standalone root entrypoints like `src/index.ts`, `src/server.ts`, or a single file that genuinely has no cohesive folder boundary.

Do not enumerate every file in a folder just to avoid broad matching. If a directory contains nested tests, fixtures, generated files, or mixed concerns, prefer one of these approaches:

- Keep the directory as the layer path and add a separate higher-level test/fixture layer when needed.
- Split or rebalance layers around actual directories.
- Add ignore entries for files that should not participate in dependency validation.
- Use a file path only when the file is truly a standalone exception.

When presenting proposed layers, call out every file-level layer path and why it is an exception.

---

## Stack selection policy

Each `layersTopDown()` stack should model one architectural concern. Do not put every discovered directory into one global stack just because it exists under `src/`.

Use separate stacks for independent concerns that have different dependency semantics. Common examples:

- **Production/runtime** — app or library source layers, ordered from entrypoints down to foundations.
- **Tests** — test directories as the top layer, followed by the production layers they are allowed to exercise.
- **Examples/playgrounds/scripts** — local development or demo code as the top layer, followed by the production layers it may import.
- **Server/client/worker** — separate runtime targets when they have distinct entrypoints and allowed dependency directions.

Layers may be reused across stacks when a concern depends on the same lower layers. For example, a package can have `layersTopDown('production', productionLayers)` and `layersTopDown('tests', [tests, ...productionLayers])`.

When presenting proposed stacks, explain the concern each stack enforces and why it is separate.

---

## Feature seed graph policy

Features are seed-based dependency graphs. Do not treat a feature as a folder label, and do not require users to list every file the feature depends on.

Each `feature()` path must be an individual seed file under `rootDir`. Folder paths are invalid at runtime. From those seed files, depcruise-viz derives the transitive project-local dependency graph, excluding ignored files and external packages. Type-only imports are included as leaf nodes/edges but are not traversed further; if the same target is also reached through a runtime import, runtime takes precedence. A feature can also set `stopTraversalAt` to exact file paths that should remain visible as leaf nodes without pulling in their own dependencies.

Feature graphs are descriptive, not restrictive: cross-feature imports are allowed and shown in the derived graph. Layer rules still enforce architectural direction separately.

Feature graph lint failures are limited to graph problems: cycles reachable from feature seeds and unresolved project-local imports reachable from feature seeds. Missing seeds, ignored seeds, seeds outside `rootDir`, and seed or derived files not covered by a layer are hard runtime errors because the graph would be untrustworthy.

---

## Setup mode

Run when no `depcruise.config.ts` exists yet.

### Step 1 — Install dependency

```sh
pnpm add -D dependency-cruiser-viz@"workspace:*"
```

### Step 2 — Add scripts to package.json

Add these two scripts (preserve existing scripts):

```json
{
  "lint:depcruise": "depcruise-viz lint",
  "depcruise": "depcruise-viz"
}
```

### Step 3 — Analyze and recommend

Follow the [Codebase analysis](#codebase-analysis) procedure, then present recommendations for both layers and features.

### Step 4 — Generate depcruise.config.ts

Write `depcruise.config.ts` using the confirmed layers and features. See [Config file format](#config-file-format) and [Example configs](#example-configs).

### Step 5 — Verify

Run `pnpm lint:depcruise` to validate. If violations are found, show them to the user and ask whether to adjust the config or fix the violations.

---

## Update mode

Run when `depcruise.config.ts` already exists.

### Step 1 — Read current config

Read the existing `depcruise.config.ts` to understand current layers, features, ignore patterns, and rootDir.

### Step 2 — Re-analyze the codebase

Follow the [Codebase analysis](#codebase-analysis) procedure, comparing findings against the current config.

### Step 3 — Identify gaps and suggest updates

Look for:

- **Uncovered directories** — source directories not matched by any layer or feature
- **Missing features** — cross-cutting concerns that span multiple layers (shared utilities, common patterns, feature slices)
- **Feature seed issues** — missing, ignored, folder-like, outside-root, or unlayered seed files
- **Feature graph gaps** — source files not reachable from any configured feature seed
- **Stale paths** — layer/feature paths that reference directories or files that no longer exist
- **Layer rebalancing** — directories that have grown and might deserve their own layer
- **Ignore candidates** — generated files, test fixtures, or other files that should be excluded

### Step 4 — Present changes

Show the user a clear summary of proposed changes:

- What would be added (new layers, features, paths)
- What would be removed (stale paths)
- What would be reorganized

Ask for confirmation before applying. The user can accept all, pick specific changes, or adjust.

### Step 5 — Apply and verify

Update `depcruise.config.ts` with confirmed changes. Run `pnpm lint:depcruise` to validate.

---

## Codebase analysis

This procedure is shared by both modes.

1. **Map the directory structure** — list top-level directories and key files under `src/` (or the main source root).
2. **Analyze the import graph** — read the actual imports across files to understand which directories depend on which. Identify the natural dependency flow.
3. **Propose layers and stacks** — group directories into layers, then organize those layers into one or more concern-specific stacks ordered top-down (entry points at top, foundational code at bottom). Each layer should be cohesive and depend only on layers below it within that stack. Use directory paths by default; file paths are exceptions that require a clear reason. Keep tests, playgrounds, scripts, and separate runtime targets in their own stacks unless there is a specific reason to combine them.
4. **Identify features** — choose seed files that represent the user-facing or public entry points for a capability, then let depcruise-viz derive the transitive project-local dependency graph. Feature paths must be files, not folders. Good candidates:
   - Route files, RPC handlers, CLI commands, workers, or public entrypoint files that start a capability
   - Multiple seed files when one capability has multiple entry points
   - Domain concepts that touch multiple architectural boundaries
5. **Present the recommendation** — show the user:
   - The proposed layers with their paths and dependency direction
   - The proposed stacks and the concern each one enforces
   - The proposed feature seed files and which layers their derived graphs are expected to cross
   - Any existing violations (lower layers importing upper layers)
   - Orphan files not covered by any layer or feature
6. **Ask for confirmation** — let the user adjust names, grouping, ordering, or feature boundaries before generating/updating the config.

---

## API reference

### `layer(name, paths, config?)`

Creates a single layer — a logical group of files that belong together.

- `name` — unique identifier for the layer (e.g. `"ui"`, `"domain"`)
- `paths` — array of directories relative to the package root by default (e.g. `["src/components"]`). File paths such as `["src/index.ts"]` are allowed only for explicit standalone exceptions.
- `config` — optional `{ description?: string }`

A directory path like `"src/api"` matches everything inside it. A file path like `"src/index.ts"` matches that exact file.

### `layersTopDown(name, layers, config?)`

Organizes layers into a stack with enforced top-down dependency rules.

- `name` — identifier for this stack (e.g. `"app"`)
- `layers` — array of `Layer` objects, ordered **top to bottom**:
  - `layers[0]` = topmost layer (entry point, UI, etc.)
  - `layers[n-1]` = bottommost layer (foundation, shared utilities, types)
- `config` — optional `{ description?: string }`

**Dependency rule:** a layer can import from any layer **below** it, but never from a layer **above** it.

For example, with `[ui, domain, infra]`:

- `ui` can import from `domain` and `infra`
- `domain` can import from `infra` only
- `infra` cannot import from `domain` or `ui`

### `feature(name, paths, config?)`

Defines a cross-cutting feature as one or more seed files. Depcruise-viz derives the transitive project-local dependency graph from those seeds.

- `name` — unique identifier for the feature (e.g. `"auth"`, `"billing"`)
- `paths` — array of file paths relative to the package root. Directories are invalid feature seeds.
- `config` — optional `{ description?: string; stopTraversalAt?: string[] }`

Features are independent of layers. They declare seed files only; depcruise-viz derives the full local graph from those seeds and groups derived nodes by layer. External packages are not included in the feature graph. Type-only imports are included as leaf nodes/edges but are not traversed further. `stopTraversalAt` paths are exact files under `rootDir`; when reached, the file is included as a leaf and traversal stops there. Feature graph violations are cycles and unresolved project-local imports reachable from seeds.

### Config file format

The default export must satisfy `ProjectConfig`. Always import from the package name:

```typescript
import {
  feature,
  layer,
  layersTopDown,
  type ProjectConfig,
} from 'dependency-cruiser-viz';
```

The `ProjectConfig` shape:

```typescript
{
  rootDir: string;          // e.g. 'src'
  ignore?: string[];        // files to exclude from analysis
  rules: Rule[];            // array of layersTopDown() results
  features?: Feature[];     // array of feature() results
}
```

### Example configs

**Layers only:**

```typescript
import {
  layer,
  layersTopDown,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

const routes = layer('routes', ['src/routes']);
const components = layer('components', ['src/components']);
const services = layer('services', ['src/services']);
const lib = layer('lib', ['src/lib']);

export default {
  rootDir: 'src',
  rules: [layersTopDown('app', [routes, components, services, lib])],
} satisfies ProjectConfig;
```

**Layers + features:**

```typescript
import {
  feature,
  layer,
  layersTopDown,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

const routes = layer('routes', ['src/routes']);
const components = layer('components', ['src/components']);
const services = layer('services', ['src/services']);
const lib = layer('lib', ['src/lib']);

const auth = feature('auth', [
  'src/routes/auth/index.tsx',
  'src/routes/auth/callback.tsx',
]);

const billing = feature(
  'billing',
  ['src/routes/billing/index.tsx', 'src/routes/billing/invoice.tsx'],
  {
    stopTraversalAt: ['src/services/payment-client.ts'],
  },
);

export default {
  rootDir: 'src',
  rules: [layersTopDown('app', [routes, components, services, lib])],
  features: [auth, billing],
} satisfies ProjectConfig;
```
