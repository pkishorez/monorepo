---
name: enforce-boundaries
description: >
  Run depcruise-viz lint to enforce a depcruise.config.ts, wire it into CI and
  a lint:depcruise package script, and interpret its output — layer violations,
  closure violations (unclaimed-edge / closure-escape / multi-root), coverage
  warnings, exit codes, and layer-ordering cycles. Load when adding
  depcruise-viz to CI, reading lint output, driving uncovered files or edges to
  zero, or diagnosing "Layer ordering cycle detected".
metadata:
  type: lifecycle
  library: depcruise-viz
  library_version: '0.0.4'
sources:
  - 'pkishorez/monorepo:packages/depcruise-viz/src/cli/run.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/compile/validate-layer-ordering.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/src/types.ts'
  - 'pkishorez/monorepo:packages/depcruise-viz/README.md'
---

# depcruise-viz — Enforcing boundaries in CI

`depcruise-viz lint` reads `depcruise.config.ts` from the current directory,
prints layer/module/feature coverage to stdout, and writes any violations to
stderr. It exits non-zero only when violations are found, so it drops into CI
directly.

## Setup

Add a script and run it in CI:

```json
{
  "scripts": {
    "lint:depcruise": "depcruise-viz lint"
  }
}
```

```bash
npx depcruise-viz lint
```

The config must live at the package root being cruised; `lint` resolves
`rootDir` and `tsconfig.json` relative to that directory, not the process cwd.

## Core Patterns

### Read the two output classes

- **Violations** (stderr, red) — two kinds:
  - _Layer violations_ — a lower layer imports an upper one. Fix by reversing
    the import direction.
  - _Closure violations_ — the feature-tree lint contract is broken. Three
    subtypes: `unclaimed-edge` (a real module→module edge is not claimed by any
    feature), `closure-escape` (a non-barrel module exclusive to one feature has
    a real out-edge to a module outside that feature), `multi-root` (a feature
    has more than one module with no declared in-edges). Fix by adding the
    offending module to the feature's member list, flagging the source as a
    barrel, or splitting the feature.
- **Coverage warnings** (stdout, yellow) — files outside every layer or module.
  These never fail the lint.

### TDD loop: iterate against the tool

1. Run `pnpm lint:depcruise`.
2. Read the feature summary: `✓ feature (root: X, N module(s), M edge(s))`.
3. For each `unclaimed-edge` violation: the edge source module needs the target
   added to its feature, OR the source should be declared `barrel: true` if it
   legitimately fans out to many downstream modules.
4. For each `closure-escape`: the escaping out-edge's target module must be
   added to the feature, or the source flagged as a barrel.
5. Re-run. Repeat until exit 0.

```text
Features: 3 declared.
  ✓ authoring (root: authoring, 2 module(s), 1 edge(s))
  ✓ compile   (root: compile,   2 module(s), 1 edge(s))
  ✓ analyze   (root: analyze,   2 module(s), 1 edge(s))
No violations found.
```

### Identify shared modules from the lint output

A module named by ≥2 features is shared. Lint does not error on sharing — it
simply relaxes closure at that module (each feature traces only its own member
set's edges). If `lint:depcruise` reports unclaimed edges, check whether the
target module needs to be added to every feature that reaches it (making it
shared), or only to one.

### Drive uncovered files to zero

A green lint can still report uncovered files. Treat every
`N file(s) not covered by any layer/module` warning as a to-do and add
layers/modules until coverage reaches zero. Alternatively, add the file to
`ignore` if it is a package-entry barrel with no domain logic.

```text
Layers: 3 layer(s) cover 17/17 file(s).
Modules: 6 module(s) cover 17/17 layer-covered file(s).
```

### Keep a shared layer's ordering consistent

A layer name reused across stacks with opposite ordering forms a cycle, and
validation throws before cruising. Keep one consistent direction for any shared
name.

## Common Mistakes

### HIGH Treating uncovered files as harmless

Wrong:

```bash
# lint exits 0 with "12 file(s) not covered by any module" -> assumed fine
```

Correct:

```bash
# add modules (or ignore entries) until "0 file(s) not covered"
```

Coverage gaps print as yellow warnings and never set a non-zero exit, so a
green lint can hide unmodeled files.

Source: src/cli/run.ts; README Gotchas; maintainer interview

### HIGH Confusing layer violations with closure violations

Wrong:

```typescript
// "fix" a closure-escape by reordering layers (wrong lever)
```

Correct:

```typescript
// layer violation  -> fix import direction
// closure-escape   -> add module to feature, or flag source as barrel
// unclaimed-edge   -> add target to every feature that imports it
```

They have different root causes and different fixes.

Source: src/cli/run.ts; src/types.ts

### HIGH Adding visibility / sharedWith to fix a closure violation

Wrong:

```typescript
module('src/util', { feature: 'authoring', sharedWith: ['compile'] });
// sharedWith no longer exists — throws at config load
```

Correct:

```typescript
module('src/util');
feature('authoring', { root: 'authoring', modules: ['authoring', 'util'] });
feature('compile', { root: 'compile', modules: ['compile', 'util'] });
// util is now shared: named by two features
```

Sharing is emergent — name the module in every feature that reaches it.

Source: ADR 0001; CONTEXT.md

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

When two layers' paths overlap, a file matches both and is silently attributed
to the first-declared layer; reported only as a warning.

Source: src/cli/run.ts; src/types.ts

### MEDIUM Layer-ordering cycle across stacks

Wrong:

```typescript
layersTopDown('a', [x, y]); // x -> y
layersTopDown('b', [y, x]); // y -> x  => cycle
```

Correct:

```typescript
// keep a single consistent ordering wherever a layer name is shared
```

Source: src/compile/validate-layer-ordering.ts

### HIGH Generating against the wrong version surface

Wrong:

```bash
# assume a command/flag/output shape from another depcruise-viz version
```

Correct:

```bash
# check the installed depcruise-viz package.json (version) before relying on output
```

Source: package.json

### HIGH Tension: Zero-uncovered goal vs incremental adoption

Targeting zero uncovered files conflicts with dropping the tool into a large
existing codebase gradually. Model the highest-value boundaries first, then
close coverage incrementally. Add `ignore` entries for pure package-entry
re-exports that carry no domain logic.

See also: author-architecture-config/SKILL.md — every closure violation maps back to a feature-tree or barrel decision in the config.
