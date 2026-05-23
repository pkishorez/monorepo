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
3. **Propose layers** — group directories into layers ordered top-down (entry points at top, foundational code at bottom). Each layer should be a cohesive group that depends only on layers below it.
4. **Identify features** — look for cross-cutting concerns that span multiple layers. Features are groups of files across different directories that together implement a single capability. Good candidates:
   - A "feature folder" pattern where related files live in different layers (e.g. a route + component + service for the same feature)
   - Shared utilities or modules used across many layers
   - Domain concepts that touch multiple architectural boundaries
5. **Present the recommendation** — show the user:
   - The proposed layers with their paths and dependency direction
   - The proposed features with their paths and which layers they cross
   - Any existing violations (lower layers importing upper layers)
   - Orphan files not covered by any layer or feature
6. **Ask for confirmation** — let the user adjust names, grouping, ordering, or feature boundaries before generating/updating the config.

---

## API reference

### `layer(name, paths, config?)`

Creates a single layer — a logical group of files that belong together.

- `name` — unique identifier for the layer (e.g. `"ui"`, `"domain"`)
- `paths` — array of file paths or directories relative to the package root (e.g. `["src/components"]`, `["src/utils.ts"]`)
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

Defines a cross-cutting feature — a group of files that together implement a single capability, potentially spanning multiple layers.

- `name` — unique identifier for the feature (e.g. `"auth"`, `"billing"`)
- `paths` — array of file/directory paths relative to the package root
- `config` — optional `{ description?: string }`

Features are independent of layers. They track file coverage for a logical capability and enforce that feature boundaries are respected (files within a feature should not have unexpected dependencies on other features' internals).

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
  'src/routes/auth',
  'src/components/auth',
  'src/services/auth.ts',
]);

const billing = feature('billing', [
  'src/routes/billing',
  'src/components/billing',
  'src/services/billing.ts',
]);

export default {
  rootDir: 'src',
  rules: [layersTopDown('app', [routes, components, services, lib])],
  features: [auth, billing],
} satisfies ProjectConfig;
```
