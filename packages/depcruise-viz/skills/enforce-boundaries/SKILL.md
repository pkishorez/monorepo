---
name: enforce-boundaries
description: >
  Run depcruise-viz to enforce a depcruise.config.ts and read its output. Three
  subcommands: `deps <path>` (analyze one folder's imports + suggested rules),
  `files [--all]` (coverage inventory), and `lint` (the CI gate — layer
  violations, module overlaps, module-rule breaches, exit codes). Load when
  wiring a lint:depcruise script into CI, reading lint/deps/files output, driving
  uncovered files to zero, or diagnosing "Layer ordering cycle detected".
metadata:
  type: lifecycle
  library: depcruise-viz
  library_version: '0.0.8'
sources:
  - 'pkishorez/monorepo:packages/depcruise-viz/src/cli/run.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/node.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/compile/validate-layer-ordering.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/types.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/README.md'
---

# depcruise-viz — Enforcing boundaries

## The idea

Once the architecture is written down in `depcruise.config.ts`, the CLI checks
the real import graph against it. You have three instruments, each with a job:

- **`depcruise-viz deps <path>`** — the _microscope_. Point it at a folder to see
  every import crossing its boundary and get suggested rules. Use it to _learn_
  the shape before authoring.
- **`depcruise-viz files [--all]`** — the _inventory_. Shows what isn't accounted
  for yet: orphaned files (no layer), module gaps (layer but no module), ignored.
- **`depcruise-viz lint`** — the _gate_. Prints the coverage report and exits
  non-zero if any violation exists. This is the pass/fail for CI.

The goal every time: **total coverage, zero violations**.

## Setup

Add a script and run it in CI. The config must live at the package root being
cruised; every subcommand resolves `rootDir` and `tsconfig.json` relative to the
config's own directory, not the process cwd.

```json
{
  "scripts": {
    "lint:depcruise": "depcruise-viz lint"
  }
}
```

```bash
pnpm lint:depcruise
```

## Core Patterns

### `deps <path>` — analyze one folder

`depcruise-viz deps <path>` prints every import crossing that folder's boundary,
`incoming` (who depends on it) and `outgoing` (what it depends on), grouped by
top-level folder and capped at 10 edges + "N more". Its `insights` block adds an
entry-point/barrel verdict, a _suggested_ set of module rules, and a config
cross-reference (is this a declared module? which layer covers it?).

```text
deps: src/authoring

incoming:
  src (3)
    - src/index.ts -> src/authoring/index.ts
    ...
outgoing:
  src (1)
    - src/authoring/module.ts -> src/types.ts

insights:
  entry-point/barrel: all incoming edges route through src/authoring/index.ts
  suggested module rules:
    onlyImportedBy: ["src/cli"]
    onlyImports: ["src/types.ts"]
  config: declared module src/authoring (authoring); covered by layer core
```

Treat the suggested rules as a _draft_, never a decision — rules encode intent
only the owner knows.

### `files` — find what's unaccounted for

`depcruise-viz files` prints a stats line then the problem groups: orphaned
(covered by no layer), module gaps (covered by a layer but no module), and
ignored. `--all` prints the full layer→module→file tree.

```text
total 17 / layer-covered 17 / module-covered 15 / orphaned 0 / covered-by-layer-but-no-module 2 / ignored 2

module gaps (covered by layer, no module):
  - src/cruise/load.ts
```

Add a layer/module for every orphaned and module-gap file until the groups are
empty.

### `lint` — the gate and its three failure classes

`lint` exits non-zero only on violations:

- **Layer violation** — an import with no allowing path in the layer graph
  (upward or between siblings). Fix by reversing the import direction, or — rarely
  — adding a deliberate `edge`.
- **Module overlap** — two module declarations where one nests inside the other.
  Un-nest them; modules must be mutually exclusive.
- **Module-rule breach** — a cross-module import that violates a declared `rules`
  constraint. Fix the import, or revisit the rule with the user.

```text
Scanned 17 file(s) (2 ignored).
Layers: 3 layer(s) cover 17/17 file(s).
Modules: 6 module(s) cover 17/17 layer-covered file(s).
No violations found.
```

### The fix loop

1. Run `pnpm lint:depcruise` (gate) and `depcruise-viz files` (inventory).
2. Add layers/modules for orphaned + module-gap files; reverse violating imports;
   un-nest overlaps.
3. Use `files --all` to inspect a module's tree, and `deps <path>` when you need
   to see exactly which imports cross a boundary.
4. Repeat until `files` shows full coverage and `lint` prints
   `No violations found.`

## Common Mistakes

### HIGH Treating uncovered files as harmless

Wrong:

```bash
# lint exits 0 with "12 file(s) not covered by any module" -> assumed fine
```

Correct:

```bash
# cross-check with `depcruise-viz files`; add layers/modules until the
# orphaned + module-gap groups are empty
```

Coverage gaps print as yellow warnings and never set a non-zero exit, so a green
lint can hide unmodeled files.

Source: src/cli/run.ts (reportCoverage); README Gotchas

### HIGH Confusing the three violation classes

Wrong:

```typescript
// "fix" a module-rule breach by reordering layers (wrong lever)
```

Correct:

```typescript
// layer violation    -> reverse the import direction
// module overlap      -> un-nest the module declarations
// module-rule breach  -> fix the import, or revisit the rule with the user
```

They have different root causes and different fixes.

Source: src/cli/run.ts; src/types.ts (LayerViolation, ModuleOverlap, ModuleViolation)

### MEDIUM Overlapping layer path patterns

Wrong:

```typescript
layer('core', ['src']); // matches everything, including src/cli
layer('cli', ['src/cli']);
```

Correct:

```typescript
layer('core', ['src/authoring', 'src/compile']);
layer('cli', ['src/cli']);
```

When two layers' paths overlap, a file matches both and is silently attributed to
the first-declared layer — reported only as a warning.

Source: src/cli/run.ts; src/types.ts (LayerConflict)

### MEDIUM Layer-ordering cycle across graphs

Wrong:

```typescript
layerGraph('a', [edge(x, y)]); // x -> y
layerGraph('b', [edge(y, x)]); // y -> x  => cycle x -> y -> x
```

Correct:

```typescript
// keep a single consistent direction wherever a layer name is shared across graphs
```

Edges from all graphs merge; a shared layer name reached in opposite directions
throws `Layer ordering cycle detected` before cruising.

Source: src/compile/validate-layer-ordering.ts

### HIGH `ignore` takes literal path prefixes, not globs

Wrong:

```typescript
ignore: ['**/__tests__/**']; // matches nothing
```

Correct:

```typescript
ignore: ['src/foo/__tests__', 'src/routeTree.gen.ts'];
```

Only `ignore` pure package-entry re-exports and generated/asset files.

Source: src/cli/load-config.ts; README Gotchas

See also: author-architecture-config/SKILL.md — every violation maps back to a
layer-graph or module decision in the config.
