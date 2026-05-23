---
name: setup-depcruise-viz
description: Sets up dependency-cruiser-viz in a monorepo package. Installs the dep, adds lint:depcruise and depcruise scripts, analyzes the codebase to recommend layers, and generates depcruise.config.ts. Use when the user wants to set up dependency layer validation, runs /setup-depcruise-viz, or asks to add depcruise-viz to a package.
disable-model-invocation: true
---

# setup-depcruise-viz

User-invoked only. Run inside a target package directory under `packages/` or `apps/`. Bail with a clear message if run from the monorepo root or anywhere else.

## Preflight

1. Verify `package.json` exists in the current directory. If not, abort: "no package.json found — run this from a package root."
2. Verify `depcruise.config.ts` does NOT already exist. If it does, abort: "this package already has a depcruise config — edit it directly instead."

## Step 1 — Install dependency

```sh
pnpm add -D dependency-cruiser-viz@"workspace:*"
```

## Step 2 — Add scripts to package.json

Add these two scripts (preserve existing scripts):

```json
{
  "lint:depcruise": "depcruise-viz lint",
  "depcruise": "depcruise-viz"
}
```

## Step 3 — Analyze the codebase and recommend layers

Analyze the package's source code to recommend a layered architecture:

1. **Map the directory structure** — list top-level directories under `src/` (or the main source root).
2. **Analyze the import graph** — read the actual imports across files to understand which directories depend on which. Identify the natural dependency flow.
3. **Propose layers** — group directories into layers ordered top-down (entry points at top, foundational code at bottom). Each layer should be a cohesive group that depends only on layers below it.
4. **Present the recommendation** — show the user:
   - The proposed layers with their paths
   - The dependency direction (what imports what)
   - Any existing violations (lower layers importing upper layers)
5. **Ask for confirmation** — let the user adjust layer names, grouping, or ordering before generating the config.

## API Reference

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

**Dependency rule:** a layer can import from any layer **below** it, but never from a layer **above** it. This enforces a clean, acyclic architecture.

For example, with `[ui, domain, infra]`:

- `ui` can import from `domain` and `infra`
- `domain` can import from `infra` only
- `infra` cannot import from `domain` or `ui`

### Config file

The default export must be an array of rules (you can have multiple stacks if needed). Always import from the package name:

```typescript
import { layer, layersTopDown } from 'dependency-cruiser-viz';
```

## Step 4 — Generate depcruise.config.ts

Write `depcruise.config.ts` in the package root using the API above. Define layers with `layer()`, combine with `layersTopDown()`, and export default an array.

### Example config

```typescript
import { layer, layersTopDown } from 'dependency-cruiser-viz';

const ui = layer('ui', ['src/components']);
const domain = layer('domain', ['src/domain', 'src/utils']);
const infra = layer('infra', ['src/api', 'src/db']);

export default [layersTopDown('app', [ui, domain, infra])];
```

## Step 5 — Verify

Run `pnpm lint:depcruise` to validate. If violations are found, show them to the user and ask whether to adjust the layer config or fix the violations.
